use super::types::{ChatMessage, StreamChatParams};
use std::collections::HashMap;

pub fn build_body(
    params: &StreamChatParams,
    messages: &[ChatMessage],
) -> HashMap<String, serde_json::Value> {
    let mut body: HashMap<String, serde_json::Value> = HashMap::new();
    body.insert("model".to_string(), serde_json::json!(params.model));

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
                "description": "获取指定 URL 的网页内容，支持多种输出格式",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "urls": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "要获取内容的 URL 列表（最多 5 个），每个必须是完整的 http:// 或 https:// 链接"
                        },
                        "format": {
                            "type": "string",
                            "enum": ["markdown", "text", "html"],
                            "description": "返回内容的格式。markdown（默认，HTML自动转为Markdown）、text（纯文本，剥离HTML标签）、html（原始HTML）"
                        },
                        "timeout": {
                            "type": "number",
                            "description": "请求超时时间（秒），默认30秒，最大120秒"
                        }
                    },
                    "required": ["urls"]
                }
            }
        }, {
            "type": "function",
            "function": {
                "name": "get_current_time",
                "description": "获取当前的精确日期、时间和星期信息",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        }, {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "获取指定城市的当前天气和未来3天预报，包括温度、天气状况、风速、湿度",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "城市名称，如 杭州、Beijing、Tokyo"
                        }
                    },
                    "required": ["location"]
                }
            }
        }]),
    );

    if params.max_tokens > 0 {
        body.insert(
            "max_tokens".to_string(),
            serde_json::json!(params.max_tokens),
        );
    }

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

    if params.thinking_enabled {
        body.insert(
            params.thinking_switch_key.clone(),
            serde_json::json!({"type": "enabled"}),
        );
        if let Some(effort) = &params.reasoning_effort {
            if !effort.trim().is_empty() {
                body.insert(
                    params.thinking_effort_key.clone(),
                    serde_json::json!(effort),
                );
            }
        }
    } else {
        body.insert(
            params.thinking_switch_key.clone(),
            serde_json::json!({"type": "disabled"}),
        );
    }

    body
}
