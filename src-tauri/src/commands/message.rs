use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
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
    pub stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub content: Option<String>,
    pub reasoning_content: Option<String>,
    pub done: bool,
    pub error: Option<String>,
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

    // Per-read idle timeout: if no bytes arrive for this long, the connection
    // is considered dead. Different from total timeout — resets on every chunk.
    // Thinking mode gives a generous window since the model may compute silently.
    let (first_byte_timeout, read_timeout) = if params.thinking_enabled {
        (
            std::time::Duration::from_secs(300), // 5 min for first token during thinking
            std::time::Duration::from_secs(120), // 2 min idle during streaming
        )
    } else {
        (
            std::time::Duration::from_secs(60),
            std::time::Duration::from_secs(30),
        )
    };

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .tcp_keepalive(Some(std::time::Duration::from_secs(30)))
        .pool_idle_timeout(Some(std::time::Duration::from_secs(90)))
        .build()
        .map_err(|e| AppError::Http(format!("Failed to create client: {}", e)))?;

    let mut body: HashMap<String, serde_json::Value> = HashMap::new();
    body.insert("model".to_string(), serde_json::json!(params.model));
    body.insert("messages".to_string(), serde_json::json!(params.messages));
    body.insert("stream".to_string(), serde_json::json!(true));

    // max_tokens is valid in both thinking and non-thinking modes
    if params.max_tokens > 0 {
        body.insert(
            "max_tokens".to_string(),
            serde_json::json!(params.max_tokens),
        );
    }

    // temperature and top_p are only effective in non-thinking mode
    if !params.thinking_enabled {
        body.insert(
            "temperature".to_string(),
            serde_json::json!(params.temperature),
        );
        body.insert("top_p".to_string(), serde_json::json!(params.top_p));
        body.insert(
            "frequency_penalty".to_string(),
            serde_json::json!(params.frequency_penalty),
        );
        body.insert(
            "presence_penalty".to_string(),
            serde_json::json!(params.presence_penalty),
        );
    }

    // thinking mode control
    if params.thinking_enabled {
        body.insert(
            "thinking".to_string(),
            serde_json::json!({"type": "enabled"}),
        );
        if let Some(effort) = params.reasoning_effort {
            body.insert("reasoning_effort".to_string(), serde_json::json!(effort));
        }
    } else {
        body.insert(
            "thinking".to_string(),
            serde_json::json!({"type": "disabled"}),
        );
    }

    let response = tokio::time::timeout(
        first_byte_timeout,
        client
            .post(&url)
            .header("Authorization", format!("Bearer {}", params.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send(),
    )
    .await
    .map_err(|_| AppError::Stream("Request timed out waiting for server response".into()))?
    .map_err(|e| AppError::Http(format!("Request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let error_text = response.text().await.unwrap_or_default();
        let err_msg = format!("API error {}: {}", status, error_text);
        let _ = app.emit(
            &format!("chat-stream:{}-error", conversation_id),
            StreamChunk {
                content: None,
                reasoning_content: None,
                done: true,
                error: Some(err_msg.clone()),
            },
        );
        return Err(AppError::Http(err_msg));
    }

    let mut stream = response.bytes_stream();
    let mut full_content = String::new();
    let mut line_buf = String::new();

    loop {
        let chunk =
            match tokio::time::timeout(read_timeout, futures_util::StreamExt::next(&mut stream))
                .await
            {
                Err(_elapsed) => {
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
                let _ = app.emit(
                    &format!("chat-stream:{}", conversation_id),
                    StreamChunk {
                        content: None,
                        reasoning_content: None,
                        done: true,
                        error: None,
                    },
                );
                return Ok(full_content);
            }
            if let Some(data) = line.strip_prefix("data: ") {
                match serde_json::from_str::<serde_json::Value>(data) {
                    Ok(json) => {
                        let delta = &json["choices"][0]["delta"];
                        let content = delta["content"].as_str().map(|s| s.to_string());
                        let reasoning = delta["reasoning_content"].as_str().map(|s| s.to_string());

                        if content.is_some() || reasoning.is_some() {
                            if let Some(ref c) = content {
                                full_content.push_str(c);
                            }
                            let _ = app.emit(
                                &format!("chat-stream:{}", conversation_id),
                                StreamChunk {
                                    content,
                                    reasoning_content: reasoning,
                                    done: false,
                                    error: None,
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

    let _ = app.emit(
        &format!("chat-stream:{}", conversation_id),
        StreamChunk {
            content: None,
            reasoning_content: None,
            done: true,
            error: None,
        },
    );
    Ok(full_content)
}
