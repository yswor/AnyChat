import type { Conversation, Message, ToolCallInfo } from "../types";
import { reconstructContent } from "./chatNormalizers";

export type ApiMessage = {
  role: string;
  content: string;
  reasoning_content?: string;
  tool_calls?: ToolCallInfo[];
  tool_call_id?: string;
};

export function buildApiMessages(
  conv: Conversation,
  messages: Message[],
  currentContent: string,
  currentMsgId: string | undefined,
): ApiMessage[] {
  const apiMessages: ApiMessage[] = [];
  if (conv.system_prompt) {
    apiMessages.push({ role: "system", content: conv.system_prompt });
  }
  for (const msg of messages) {
    const m: ApiMessage = {
      role: msg.role,
      content:
        currentMsgId != null && msg.id === currentMsgId
          ? currentContent
          : msg.attachment_data
            ? reconstructContent(msg.content, msg.attachment_data)
            : msg.content,
    };
    if (msg.reasoning_content) {
      m.reasoning_content = msg.reasoning_content;
    }
    if (msg.tool_calls) {
      m.tool_calls = msg.tool_calls;
    }
    if (msg.tool_call_id) {
      m.tool_call_id = msg.tool_call_id;
    }
    apiMessages.push(m);
  }
  return apiMessages;
}
