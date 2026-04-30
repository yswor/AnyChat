use crate::store;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamChatInput {
    pub conversation_id: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<super::types::ChatMessage>,
    pub temperature: f64,
    pub max_tokens: i64,
    pub top_p: f64,
    pub frequency_penalty: f64,
    pub presence_penalty: f64,
    pub thinking_enabled: bool,
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub thinking_switch_key: Option<String>,
    #[serde(default)]
    pub thinking_effort_key: Option<String>,
}

#[tauri::command]
pub async fn stream_chat(app: tauri::AppHandle, input: StreamChatInput) -> Result<String, String> {
    let api_key = store::decrypt_api_key(&input.api_key)
        .map_err(|e| format!("API Key 解密失败，请重新输入 API Key: {}", e))?;

    let params = super::types::StreamChatParams {
        base_url: input.base_url,
        api_key,
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.max_tokens,
        top_p: input.top_p,
        frequency_penalty: input.frequency_penalty,
        presence_penalty: input.presence_penalty,
        thinking_enabled: input.thinking_enabled,
        reasoning_effort: input.reasoning_effort,
        thinking_switch_key: input
            .thinking_switch_key
            .unwrap_or_else(|| "thinking".into()),
        thinking_effort_key: input
            .thinking_effort_key
            .unwrap_or_else(|| "reasoning_effort".into()),
        stream: true,
    };

    super::message::stream_chat_request(params, app, input.conversation_id)
        .await
        .map_err(|e| e.to_string())
}
