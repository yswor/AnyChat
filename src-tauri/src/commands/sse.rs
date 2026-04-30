use super::types::{SseResult, StreamChunk};
use crate::error::AppError;
use std::collections::HashMap;
use tauri::Emitter;

pub async fn do_sse_request(
    url: &str,
    api_key: &str,
    body: &HashMap<String, serde_json::Value>,
    first_byte_timeout: std::time::Duration,
    read_timeout: std::time::Duration,
    app: &tauri::AppHandle,
    conversation_id: &str,
) -> Result<SseResult, AppError> {
    let model = body
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    tracing::info!(
        "[sse] Sending streaming request to {} (model: {})",
        url,
        model
    );

    let body_str = serde_json::to_string(body)
        .map_err(|e| AppError::InvalidInput(format!("Failed to serialize request body: {}", e)))?;
    tracing::info!(
        "[sse] REQUEST body ({} bytes): {}",
        body_str.len(),
        body_str
    );

    let client = crate::api_client::http_client();

    let mut last_error: Option<AppError> = None;
    let max_retries = 2;

    for attempt in 0..=max_retries {
        if attempt > 0 {
            tracing::info!(
                "[sse] Retry attempt {}/{} for conversation {}",
                attempt,
                max_retries,
                conversation_id
            );
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        }

        let result = send_sse_request(
            &client,
            url,
            api_key,
            body_str.clone(),
            first_byte_timeout,
            read_timeout,
            app,
            conversation_id,
        )
        .await;

        match result {
            Ok(sse_result) => return Ok(sse_result),
            Err(err) => {
                let is_retryable = match &err {
                    AppError::Http(msg) => !msg.starts_with("API error 4"),
                    _ => true,
                };

                if !is_retryable {
                    tracing::warn!("[sse] Non-retryable error, giving up: {}", err);
                    return Err(err);
                }

                tracing::warn!(
                    "[sse] Retryable error (attempt {}/{}): {}",
                    attempt + 1,
                    max_retries,
                    err
                );
                last_error = Some(err);
            }
        }
    }

    Err(last_error.unwrap_or(AppError::Stream("Request failed after retries".into())))
}

#[allow(clippy::too_many_arguments)]
async fn send_sse_request(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body_str: String,
    first_byte_timeout: std::time::Duration,
    read_timeout: std::time::Duration,
    app: &tauri::AppHandle,
    conversation_id: &str,
) -> Result<SseResult, AppError> {
    let response = tokio::time::timeout(
        first_byte_timeout,
        client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .body(body_str)
            .send(),
    )
    .await
    .map_err(|_| {
        tracing::warn!("[sse] Request timed out waiting for server response");
        AppError::Stream("Request timed out waiting for server response".into())
    })?
    .map_err(|e| {
        tracing::warn!("[sse] Request failed: {}", e);
        AppError::Http(format!("Request failed: {}", e))
    })?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let error_text = response.text().await.unwrap_or_default();
        let err_msg = format!("API error {}: {}", status, error_text);
        tracing::warn!(
            "[sse] HTTP {} for conversation {}: {}",
            status,
            conversation_id,
            error_text
        );
        let _ = app.emit(
            &format!("chat-stream:{}", conversation_id),
            StreamChunk {
                content: None,
                reasoning_content: None,
                done: true,
                error: Some(err_msg.clone()),
                usage_prompt: None,
                usage_completion: None,
                usage_cached: None,
                tool_status: None,
                tool_call: None,
            },
        );
        return Err(AppError::Http(err_msg));
    }

    let mut stream = response.bytes_stream();
    let mut full_content = String::new();
    let mut full_reasoning = String::new();
    let mut line_buf = String::new();
    let mut last_usage: Option<(i64, i64, i64)> = None;
    let mut tool_calls: Vec<serde_json::Value> = Vec::new();

    loop {
        let chunk =
            match tokio::time::timeout(read_timeout, futures_util::StreamExt::next(&mut stream))
                .await
            {
                Err(_elapsed) => {
                    tracing::warn!(
                        "[sse] Stream read timeout for conversation {}: no data for {}s",
                        conversation_id,
                        read_timeout.as_secs()
                    );
                    return Err(AppError::Stream(format!(
                        "Stream read timeout: no data received for {}s",
                        read_timeout.as_secs()
                    )));
                }
                Ok(None) => break,
                Ok(Some(Err(e))) => {
                    return Err(AppError::Stream(format!("Stream error: {}", e)));
                }
                Ok(Some(Ok(bytes))) => bytes,
            };

        let text = String::from_utf8_lossy(&chunk);
        line_buf.push_str(&text);

        while let Some(nl_pos) = line_buf.find('\n') {
            let line = line_buf[..nl_pos].trim().to_string();
            line_buf = line_buf[nl_pos + 1..].to_string();

            if line.is_empty() {
                continue;
            }
            if line == "data: [DONE]" {
                tracing::info!(
                    "[sse] Stream ended for conversation {}: {} content chars, {} tool_calls",
                    conversation_id,
                    full_content.len(),
                    tool_calls.len()
                );
                return Ok(SseResult {
                    content: full_content,
                    reasoning: full_reasoning,
                    tool_calls,
                    usage: last_usage,
                });
            }
            if let Some(data) = line.strip_prefix("data: ") {
                match serde_json::from_str::<serde_json::Value>(data) {
                    Ok(json) => {
                        if let Some(usage) = json.get("usage") {
                            last_usage = Some((
                                usage["prompt_tokens"].as_i64().unwrap_or(0),
                                usage["completion_tokens"].as_i64().unwrap_or(0),
                                usage["prompt_tokens_details"]["cached_tokens"]
                                    .as_i64()
                                    .unwrap_or(0),
                            ));
                        }

                        let delta = &json["choices"][0]["delta"];
                        let content = delta["content"].as_str().map(|s| s.to_string());
                        let reasoning = delta["reasoning_content"].as_str().map(|s| s.to_string());

                        if let Some(tcs) = delta["tool_calls"].as_array() {
                            for tc in tcs {
                                let idx = tc["index"].as_u64().unwrap_or(0) as usize;
                                if idx >= tool_calls.len() {
                                    tool_calls.resize(idx + 1, serde_json::json!({}));
                                }
                                let existing = &mut tool_calls[idx];
                                if let Some(obj) = tc.as_object() {
                                    for (k, v) in obj {
                                        if v.is_null() {
                                            continue;
                                        }
                                        if k == "function" {
                                            if existing.get("function").is_none() {
                                                existing["function"] = serde_json::json!({});
                                            }
                                            let func_obj = &mut existing["function"];
                                            if let Some(func_new) = v.as_object() {
                                                for (fk, fv) in func_new {
                                                    if fv.is_null() {
                                                        continue;
                                                    }
                                                    if fk == "arguments"
                                                        && func_obj["arguments"].is_string()
                                                    {
                                                        let prev: &str = func_obj["arguments"]
                                                            .as_str()
                                                            .unwrap_or("");
                                                        let next: &str = fv.as_str().unwrap_or("");
                                                        let merged = format!("{}{}", prev, next);
                                                        func_obj["arguments"] =
                                                            serde_json::json!(merged);
                                                    } else {
                                                        func_obj[fk] = fv.clone();
                                                    }
                                                }
                                            }
                                        } else {
                                            existing[k] = v.clone();
                                        }
                                    }
                                }
                            }
                        }

                        if content.is_some() || reasoning.is_some() {
                            if let Some(ref c) = content {
                                full_content.push_str(c);
                            }
                            if let Some(ref r) = reasoning {
                                full_reasoning.push_str(r);
                            }
                            let _ = app.emit(
                                &format!("chat-stream:{}", conversation_id),
                                StreamChunk {
                                    content,
                                    reasoning_content: reasoning,
                                    done: false,
                                    error: None,
                                    usage_prompt: None,
                                    usage_completion: None,
                                    usage_cached: None,
                                    tool_status: None,
                                    tool_call: None,
                                },
                            );
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to parse SSE line: {} - data: {}", e, data);
                    }
                }
            }
        }
    }

    Ok(SseResult {
        content: full_content,
        reasoning: full_reasoning,
        tool_calls,
        usage: last_usage,
    })
}
