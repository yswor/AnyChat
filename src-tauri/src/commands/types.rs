use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call: Option<ToolCallEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallEvent {
    pub id: String,
    pub name: String,
    pub arguments: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

pub struct SseResult {
    pub content: String,
    pub reasoning: String,
    pub tool_calls: Vec<serde_json::Value>,
    pub usage: Option<(i64, i64, i64)>,
}

pub const MAX_TOOL_ROUNDS: usize = 5;
pub const DOOM_LOOP_THRESHOLD: usize = 3;

pub fn is_same_tool_calls(a: &[serde_json::Value], b: &[serde_json::Value]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    for (ca, cb) in a.iter().zip(b.iter()) {
        if ca["function"]["name"] != cb["function"]["name"]
            || ca["function"]["arguments"] != cb["function"]["arguments"]
        {
            return false;
        }
    }
    true
}
