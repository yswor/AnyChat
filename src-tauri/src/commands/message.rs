use crate::error::AppError;
use crate::web_fetch;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamChatParams {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: f64,
    pub max_tokens: i64,
    pub top_p: f64,
    pub frequency_penalty: f64,
    pub presence_penalty: f64,
    pub thinking_enabled: bool,
    pub reasoning_effort: Option<String>,
    #[serde(default = "default_thinking_switch_key")]
    pub thinking_switch_key: String,
    #[serde(default = "default_thinking_effort_key")]
    pub thinking_effort_key: String,
    pub stream: bool,
}

fn default_thinking_switch_key() -> String {
    "thinking".to_string()
}

fn default_thinking_effort_key() -> String {
    "reasoning_effort".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub content: Option<String>,
    pub reasoning_content: Option<String>,
    pub done: bool,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_prompt: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_completion: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_cached: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_status: Option<String>,
}

const MAX_TOOL_ROUNDS: usize = 5;

fn build_body(params: &StreamChatParams, messages: &[ChatMessage]) -> HashMap<String, serde_json::Value> {
    let mut body: HashMap<String, serde_json::Value> = HashMap::new();
    body.insert("model".to_string(), serde_json::json!(params.model));

    // Manually build messages array to avoid serde field contamination
    let msgs: Vec<serde_json::Value> = messages
        .iter()
        .map(|msg| {
            let mut m = serde_json::Map::new();
            m.insert("role".to_string(), serde_json::json!(&msg.role));
            m.insert("content".to_string(), serde_json::json!(&msg.content));
            if let Some(ref n) = msg.name {
                if !n.is_empty() {
                    m.insert("name".to_string(), serde_json::json!(n));
                }
            }
            if let Some(ref rc) = msg.reasoning_content {
                m.insert("reasoning_content".to_string(), serde_json::json!(rc));
            }
            if let Some(ref tc) = msg.tool_calls {
                m.insert("tool_calls".to_string(), serde_json::json!(tc));
            }
            if let Some(ref tcid) = msg.tool_call_id {
                m.insert("tool_call_id".to_string(), serde_json::json!(tcid));
            }
            serde_json::Value::Object(m)
        })
        .collect();
    body.insert("messages".to_string(), serde_json::json!(msgs));
    body.insert("stream".to_string(), serde_json::json!(true));

    body.insert(
        "tools".to_string(),
        serde_json::json!([{
            "type": "function",
            "function": {
                "name": "webfetch",
                "description": "获取指定 URL 的网页内容",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "要获取内容的 URL"
                        }
                    },
                    "required": ["url"]
                }
            }
        }]),
    );

    if params.max_tokens > 0 {
        body.insert("max_tokens".to_string(), serde_json::json!(params.max_tokens));
    }

    if !params.thinking_enabled {
        body.insert("temperature".to_string(), serde_json::json!(params.temperature));
        body.insert("top_p".to_string(), serde_json::json!(params.top_p));
        body.insert("frequency_penalty".to_string(), serde_json::json!(params.frequency_penalty));
        body.insert("presence_penalty".to_string(), serde_json::json!(params.presence_penalty));
    }

    if params.thinking_enabled {
        body.insert(params.thinking_switch_key.clone(), serde_json::json!({"type": "enabled"}));
        if let Some(effort) = &params.reasoning_effort {
            body.insert(params.thinking_effort_key.clone(), serde_json::json!(effort));
        }
    } else {
        body.insert(params.thinking_switch_key.clone(), serde_json::json!({"type": "disabled"}));
    }

    body
}

struct SseResult {
    content: String,
    reasoning: String,
    tool_calls: Vec<serde_json::Value>,
    usage: Option<(i64, i64, i64)>,
}

async fn do_sse_request(
    url: &str,
    api_key: &str,
    body: &HashMap<String, serde_json::Value>,
    first_byte_timeout: std::time::Duration,
    read_timeout: std::time::Duration,
    app: &tauri::AppHandle,
    conversation_id: &str,
) -> Result<SseResult, AppError> {
    let model = body.get("model").and_then(|v| v.as_str()).unwrap_or("unknown");
    tracing::info!(
        "[sse] Sending streaming request to {} (model: {})",
        url,
        model
    );

    let body_str = serde_json::to_string(body).unwrap_or_default();
    tracing::info!("[sse] REQUEST body ({} bytes): {}", body_str.len(), body_str);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .tcp_keepalive(Some(std::time::Duration::from_secs(30)))
        .pool_idle_timeout(Some(std::time::Duration::from_secs(90)))
        .build()
        .map_err(|e| AppError::Http(format!("Failed to create client: {}", e)))?;

    let response = tokio::time::timeout(
        first_byte_timeout,
        client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .body(body_str.clone())
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
            &format!("chat-stream:{}-error", conversation_id),
            StreamChunk {
                content: None,
                reasoning_content: None,
                done: true,
                error: Some(err_msg.clone()),
                usage_prompt: None,
                usage_completion: None,
                usage_cached: None,
                tool_status: None,
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
        let chunk = match tokio::time::timeout(read_timeout, futures_util::StreamExt::next(&mut stream)).await {
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
                                usage["prompt_tokens_details"]["cached_tokens"].as_i64().unwrap_or(0),
                            ));
                        }

                        let delta = &json["choices"][0]["delta"];
                        let content = delta["content"].as_str().map(|s| s.to_string());
                        let reasoning = delta["reasoning_content"].as_str().map(|s| s.to_string());

                        // Merge tool call chunks by index — SSE sends tool_calls in fragments
                        if let Some(tcs) = delta["tool_calls"].as_array() {
                            for tc in tcs {
                                let idx = tc["index"].as_u64().unwrap_or(0) as usize;
                                if idx >= tool_calls.len() {
                                    tool_calls.resize(idx + 1, serde_json::json!({}));
                                }
                                let existing = &mut tool_calls[idx];
                                // Shallow merge: copy non-null fields from tc into existing
                                if let Some(obj) = tc.as_object() {
                                    for (k, v) in obj {
                                        if v.is_null() {
                                            continue;
                                        }
                                        if k == "function" {
                                            // function is a nested object — recurse into it
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
                                                        // arguments string arrives in fragments — concatenate
                                                        let prev: &str =
                                                            func_obj["arguments"].as_str().unwrap_or("");
                                                        let next: &str =
                                                            fv.as_str().unwrap_or("");
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

async fn execute_tool(name: &str, args: &serde_json::Value) -> String {
    match name {
        "webfetch" => {
            let url = args["url"].as_str().unwrap_or("");
            if url.is_empty() {
                tracing::warn!("[tool] webfetch called with empty URL");
                return "错误: 未提供 URL".to_string();
            }
            tracing::info!("[tool] Executing webfetch for {}", url);
            match web_fetch::fetch_url(url, "").await {
                Ok(content) => {
                    tracing::info!(
                        "[tool] webfetch succeeded for {}: {} chars",
                        url,
                        content.len()
                    );
                    content
                }
                Err(e) => {
                    tracing::warn!("[tool] webfetch failed for {}: {}", url, e);
                    format!("获取网页失败: {}", e)
                }
            }
        }
        _ => {
            tracing::warn!("[tool] Unknown tool requested: {}", name);
            format!("不支持的工具: {}", name)
        }
    }
}

pub async fn stream_chat_request(
    params: StreamChatParams,
    app: tauri::AppHandle,
    conversation_id: String,
) -> Result<String, AppError> {
    let url = if params.base_url.ends_with('/') {
        format!("{}chat/completions", params.base_url)
    } else {
        format!("{}/chat/completions", params.base_url)
    };

    let (first_byte_timeout, read_timeout) = if params.thinking_enabled {
        (
            std::time::Duration::from_secs(300),
            std::time::Duration::from_secs(120),
        )
    } else {
        (
            std::time::Duration::from_secs(60),
            std::time::Duration::from_secs(30),
        )
    };

    let mut messages = params.messages.clone();
    let mut round = 0;

    loop {
        if round >= MAX_TOOL_ROUNDS {
            tracing::warn!(
                "[chat] Conversation {} reached max tool call rounds ({})",
                conversation_id,
                MAX_TOOL_ROUNDS
            );
            let _ = app.emit(
                &format!("chat-stream:{}-error", conversation_id),
                StreamChunk {
                    content: None, reasoning_content: None, done: true,
                    error: Some("达到最大工具调用轮数".into()),
                    usage_prompt: None, usage_completion: None, usage_cached: None,
                    tool_status: None,
                },
            );
            return Err(AppError::Stream("Max tool call rounds reached".into()));
        }

        let body = build_body(&params, &messages);

        tracing::info!(
            "[chat] Tool call round {}/{} for conversation {} ({} messages)",
            round + 1,
            MAX_TOOL_ROUNDS,
            conversation_id,
            messages.len()
        );

        let result = do_sse_request(
            &url,
            &params.api_key,
            &body,
            first_byte_timeout,
            read_timeout,
            &app,
            &conversation_id,
        )
        .await?;

        // No tool calls — this is the final answer
        if result.tool_calls.is_empty() {
            tracing::info!(
                "[chat] Conversation {}: final answer after {} round(s), {} chars",
                conversation_id,
                round,
                result.content.len()
            );
            let (up, uc, uca) = result.usage.unwrap_or((0, 0, 0));
            let _ = app.emit(
                &format!("chat-stream:{}", conversation_id),
                StreamChunk {
                    content: None,
                    reasoning_content: None,
                    done: true,
                    error: None,
                    usage_prompt: (up > 0).then_some(up),
                    usage_completion: (uc > 0).then_some(uc),
                    usage_cached: (uca > 0).then_some(uca),
                    tool_status: None,
                },
            );
            return Ok(result.content);
        }

        tracing::info!(
            "[chat] Conversation {}: received {} tool call(s) in round {}",
            conversation_id,
            result.tool_calls.len(),
            round
        );

        // Append assistant message with tool_calls
        let assistant_content: Option<String> = if result.content.is_empty() { None } else { Some(result.content.clone()) };
        messages.push(ChatMessage {
            role: "assistant".to_string(),
            content: assistant_content,
            reasoning_content: if !result.reasoning.is_empty() { Some(result.reasoning.clone()) } else { None },
            tool_calls: Some(result.tool_calls.clone()),
            tool_call_id: None,
            name: None,
        });

        // Execute each tool
        for tc in &result.tool_calls {
            let func = &tc["function"];
            let func_name = func["name"].as_str().unwrap_or("");
            let func_args = &func["arguments"];

            // Parse arguments (may be JSON string)
            let args: serde_json::Value = if let Some(s) = func_args.as_str() {
                serde_json::from_str(s).unwrap_or(serde_json::json!({}))
            } else {
                func_args.clone()
            };

            let status_msg = match func_name {
                "webfetch" => {
                    let url = args["url"].as_str().unwrap_or("");
                    format!("正在获取网页内容: {}", url)
                }
                _ => format!("正在执行: {}", func_name),
            };

            let _ = app.emit(
                &format!("chat-stream:{}", conversation_id),
                StreamChunk {
                    content: None,
                    reasoning_content: None,
                    done: false,
                    error: None,
                    usage_prompt: None,
                    usage_completion: None,
                    usage_cached: None,
                    tool_status: Some(status_msg),
                },
            );

            let tool_result = execute_tool(func_name, &args).await;
            let tc_id = tc["id"].as_str().unwrap_or("").to_string();

            messages.push(ChatMessage {
                role: "tool".to_string(),
                content: Some(tool_result),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: Some(tc_id),
                name: None,
            });
        }

        round += 1;
    }
}
