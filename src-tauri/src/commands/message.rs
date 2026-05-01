use super::body::build_body;
use super::sse::do_sse_request;
use super::tools::execute_tool;
use super::types::{
    is_same_tool_calls, ChatMessage, StreamChunk, ToolCallEvent, DOOM_LOOP_THRESHOLD,
    MAX_TOOL_ROUNDS,
};
use crate::error::AppError;
use tauri::Emitter;

pub async fn stream_chat_request(
    params: super::types::StreamChatParams,
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
    let mut last_tool_calls: Vec<serde_json::Value> = Vec::new();
    let mut doom_counter: usize = 0;

    loop {
        let mut body = build_body(&params, &messages);
        if round + 1 >= MAX_TOOL_ROUNDS {
            body.remove("tools");
        }

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
                    tool_call: None,
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

        // Doom loop detection
        let doom_hit = if last_tool_calls.is_empty() {
            last_tool_calls = result.tool_calls.clone();
            doom_counter = 1;
            false
        } else if is_same_tool_calls(&result.tool_calls, &last_tool_calls) {
            doom_counter += 1;
            doom_counter >= DOOM_LOOP_THRESHOLD
        } else {
            last_tool_calls = result.tool_calls.clone();
            doom_counter = 1;
            false
        };

        if doom_hit {
            tracing::warn!(
                "[chat] Doom loop detected for conversation {} ({} consecutive identical tool calls)",
                conversation_id,
                doom_counter
            );
        }

        // Append assistant message with tool_calls
        let assistant_content: Option<String> = if result.content.is_empty() {
            None
        } else {
            Some(result.content.clone())
        };
        messages.push(ChatMessage {
            role: "assistant".to_string(),
            content: assistant_content,
            reasoning_content: if !result.reasoning.is_empty() {
                Some(result.reasoning.clone())
            } else {
                None
            },
            tool_calls: Some(result.tool_calls.clone()),
            tool_call_id: None,
            name: None,
        });

        // Execute each tool (or skip if doom loop)
        let doom_warning = "检测到重复工具调用循环（连续3次调用相同的工具和参数），请停止重复调用，基于已有数据回答问题或换用其他方式".to_string();
        if doom_hit {
            for tc in &result.tool_calls {
                let tc_id = tc["id"].as_str().unwrap_or("").to_string();
                let func = &tc["function"];
                let func_name = func["name"].as_str().unwrap_or("");

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
                        tool_status: Some(format!("检测到重复调用: {}", func_name)),
                        tool_call: Some(ToolCallEvent {
                            id: tc_id.clone(),
                            name: func_name.to_string(),
                            arguments: "{}".to_string(),
                            status: "executing".to_string(),
                            result: None,
                        }),
                    },
                );

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
                        tool_status: Some(String::new()),
                        tool_call: Some(ToolCallEvent {
                            id: tc_id.clone(),
                            name: func_name.to_string(),
                            arguments: "{}".to_string(),
                            status: "completed".to_string(),
                            result: Some(doom_warning.clone()),
                        }),
                    },
                );

                messages.push(ChatMessage {
                    role: "tool".to_string(),
                    content: Some(doom_warning.clone()),
                    reasoning_content: None,
                    tool_calls: None,
                    tool_call_id: Some(tc_id),
                    name: None,
                });
            }
        } else {
            for tc in &result.tool_calls {
                let func = &tc["function"];
                let func_name = func["name"].as_str().unwrap_or("");
                let func_args = &func["arguments"];
                let args_str = func_args.as_str().unwrap_or("{}").to_string();

                // Parse arguments (may be JSON string)
                let args: serde_json::Value = if let Some(s) = func_args.as_str() {
                    serde_json::from_str(s).unwrap_or(serde_json::json!({}))
                } else {
                    func_args.clone()
                };

                let tc_id = tc["id"].as_str().unwrap_or("").to_string();

                let status_msg = match func_name {
                    "webfetch" => {
                        let count = args["urls"].as_array().map(|a| a.len().min(5)).unwrap_or(0);
                        if count == 0 {
                            if let Some(u) = args["url"].as_str() {
                                format!("正在获取网页内容: {}", u)
                            } else {
                                "正在获取网页内容".to_string()
                            }
                        } else {
                            format!("正在获取 {} 个网页内容", count)
                        }
                    }
                    "get_weather" => {
                        let loc = args["location"].as_str().unwrap_or("");
                        if loc.is_empty() {
                            "正在查询天气".to_string()
                        } else {
                            format!("正在查询天气: {}", loc)
                        }
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
                        tool_call: Some(ToolCallEvent {
                            id: tc_id.clone(),
                            name: func_name.to_string(),
                            arguments: args_str.clone(),
                            status: "executing".to_string(),
                            result: None,
                        }),
                    },
                );

                let tool_result = execute_tool(func_name, &args, &app).await;

                let result_status = if tool_result.starts_with("错误")
                    || tool_result.starts_with("获取网页失败")
                    || tool_result.starts_with("不支持的工具")
                {
                    "failed"
                } else {
                    "completed"
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
                        tool_status: Some(String::new()),
                        tool_call: Some(ToolCallEvent {
                            id: tc_id.clone(),
                            name: func_name.to_string(),
                            arguments: args_str,
                            status: result_status.to_string(),
                            result: Some(tool_result.clone()),
                        }),
                    },
                );

                messages.push(ChatMessage {
                    role: "tool".to_string(),
                    content: Some(tool_result),
                    reasoning_content: None,
                    tool_calls: None,
                    tool_call_id: Some(tc_id),
                    name: None,
                });
            }
        }

        round += 1;

        if round >= MAX_TOOL_ROUNDS {
            tracing::warn!(
                "[chat] Conversation {} reached max tool call rounds ({})",
                conversation_id,
                MAX_TOOL_ROUNDS
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
                    tool_call: None,
                },
            );
            return Ok(result.content);
        }
    }
}
