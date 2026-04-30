import type { Conversation, Message } from "../types";
import { DEFAULT_REASONING_EFFORT } from "../constants/defaults";

export function tryParseJson<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
  } catch {
    return fallback;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeConversation(row: any): Conversation {
  return {
    id: row.id,
    title: row.title || undefined,
    provider_id: row.provider_id,
    model: row.model,
    temperature: Number(row.temperature),
    max_tokens: Number(row.max_tokens),
    top_p: Number(row.top_p),
    frequency_penalty: Number(row.frequency_penalty ?? 0),
    presence_penalty: Number(row.presence_penalty ?? 0),
    system_prompt: row.system_prompt || "",
    thinking_enabled: Boolean(row.thinking_enabled),
    reasoning_effort: row.reasoning_effort || DEFAULT_REASONING_EFFORT,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeMessage(row: any): Message {
  const usageDetails = tryParseJson<Message["usage_details"]>(row.usage_details, undefined);
  const toolCalls = tryParseJson<Message["tool_calls"]>(row.tool_calls, undefined);
  const toolNodes = tryParseJson<Message["toolNodes"]>(row.tool_nodes, undefined);
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    reasoning_content: row.reasoning_content || undefined,
    attachment_type: row.attachment_type || undefined,
    attachment_data: row.attachment_data || undefined,
    tokens: row.tokens != null ? Number(row.tokens) : undefined,
    usage_details: usageDetails,
    provider_id: row.provider_id || undefined,
    tool_call_id: row.tool_call_id || undefined,
    tool_calls: toolCalls,
    toolNodes,
    created_at: row.created_at,
  };
}

export function reconstructContent(displayContent: string, attachmentData: string): string {
  const nlIdx = displayContent.indexOf("\n\n");
  const header = nlIdx >= 0 ? displayContent.slice(0, nlIdx) : displayContent;
  const body = nlIdx >= 0 ? displayContent.slice(nlIdx + 2) : "";
  return body
    ? `${header}\n\n${attachmentData}\n\n---\n${body}`
    : `${header}\n\n${attachmentData}`;
}
