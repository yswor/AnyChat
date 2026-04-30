import { create } from "zustand";
import type { Conversation, Message, StreamChunk, ToolCallNode } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../db";
import { v4 as uuidv4 } from "uuid";
import { normalizeConversation, normalizeMessage } from "./chatNormalizers";
import { buildApiMessages } from "./chatApi";

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  streamState: {
    content: string;
    reasoning: string;
    isStreaming: boolean;
    error: string | null;
    toolCallNodes: ToolCallNode[];
    reasoningCursor: number;
  };
  loading: boolean;

  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  createConversation: (
    providerId: string,
    model: string,
    params: {
      temperature: number;
      maxTokens: number;
      topP: number;
      systemPrompt: string;
      thinkingEnabled: boolean;
      reasoningEffort: string;
      frequencyPenalty?: number;
      presencePenalty?: number;
    },
  ) => Promise<string>;
  updateConversation: (
    id: string,
    data: Partial<Conversation>,
  ) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  switchConversationProvider: (
    conversationId: string,
    newProviderId: string,
    newModel: string,
  ) => Promise<void>;

  setCurrentConversation: (id: string | null) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, data: Partial<Message>) => void;
  deleteMessage: (messageId: string) => Promise<void>;

  streamChat: (content: string, skipUserMessage?: boolean, displayContent?: string, attachment?: { type: string; data: string }) => Promise<string>;
  cancelStream: () => void;
  resetStream: () => void;
  getProviderTokens: (providerId: string) => Promise<number>;
}

const STREAM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function invokeWithTimeout<ResultT>(cmd: string, args: Record<string, unknown>): Promise<ResultT> {
  return Promise.race([
    invoke<ResultT>(cmd, args),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("请求超时")), STREAM_TIMEOUT_MS)),
  ]);
}

let activeUnlisten: (() => void) | null = null;

function resetActiveStream() {
  activeUnlisten?.();
  activeUnlisten = null;
  useChatStore.setState({
    streamState: emptyStreamState(),
  });
}

function emptyStreamState() {
  return { content: "", reasoning: "", isStreaming: false, error: null, toolCallNodes: [] as ToolCallNode[], reasoningCursor: 0 };
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  streamState: emptyStreamState(),
  loading: false,

  loadConversations: async () => {
    const d = await getDb();
    try {
      const rows: unknown[] = await d.select(
        "SELECT id, title, provider_id, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, system_prompt, thinking_enabled, reasoning_effort, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
      );
      set({ conversations: rows.map(normalizeConversation) });
    } catch (err) {
      console.warn("[chatStore] loadConversations failed:", err);
    }
  },

  loadMessages: async (conversationId: string) => {
    const d = await getDb();
    const rows: Message[] = await d.select(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversationId],
    );
    set({ messages: rows.map(normalizeMessage) });
  },

  createConversation: async (providerId, model, params) => {
    const d = await getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      await d.execute(
        `INSERT INTO conversations (id, provider_id, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, system_prompt, thinking_enabled, reasoning_effort, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          providerId,
          model,
          params.temperature,
          params.maxTokens,
          params.topP,
          params.frequencyPenalty ?? 0,
          params.presencePenalty ?? 0,
          params.systemPrompt,
          params.thinkingEnabled ? 1 : 0,
          params.reasoningEffort,
          now,
          now,
        ],
      );
    } catch (err) {
      const errorStr = String(err);
      if (errorStr.includes("no column named frequency_penalty") || errorStr.includes("no column named presence_penalty")) {
        console.warn("[chatStore] Missing columns, migrations may not have run:", errorStr);
        // Retry insert
        await d.execute(
          `INSERT INTO conversations (id, provider_id, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, system_prompt, thinking_enabled, reasoning_effort, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            id,
            providerId,
            model,
            params.temperature,
            params.maxTokens,
            params.topP,
            params.frequencyPenalty ?? 0,
            params.presencePenalty ?? 0,
            params.systemPrompt,
            params.thinkingEnabled ? 1 : 0,
            params.reasoningEffort,
            now,
            now,
          ],
        );
      } else {
        throw err;
      }
    }

    const conv: Conversation = {
      id,
      provider_id: providerId,
      model,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      frequency_penalty: params.frequencyPenalty ?? 0,
      presence_penalty: params.presencePenalty ?? 0,
      system_prompt: params.systemPrompt,
      thinking_enabled: params.thinkingEnabled,
      reasoning_effort: params.reasoningEffort,
      created_at: now,
      updated_at: now,
    };

    set((s) => ({
      conversations: [conv, ...s.conversations],
      currentConversationId: id,
      messages: [],
    }));

    return id;
  },

  updateConversation: async (id, data) => {
    const d = await getDb();
    const now = new Date().toISOString();

    const map: Record<string, string> = {
      provider_id: "provider_id",
      model: "model",
      temperature: "temperature",
      maxTokens: "max_tokens",
      max_tokens: "max_tokens",
      topP: "top_p",
      top_p: "top_p",
      frequency_penalty: "frequency_penalty",
      frequencyPenalty: "frequency_penalty",
      presence_penalty: "presence_penalty",
      presencePenalty: "presence_penalty",
      systemPrompt: "system_prompt",
      system_prompt: "system_prompt",
      thinkingEnabled: "thinking_enabled",
      thinking_enabled: "thinking_enabled",
      reasoningEffort: "reasoning_effort",
      reasoning_effort: "reasoning_effort",
    };

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
      const dbKey = map[key];
      if (dbKey) {
        sets.push(`${dbKey} = $${idx}`);
        if (typeof val === "boolean") {
          values.push(val ? 1 : 0);
        } else {
          values.push(val);
        }
        idx++;
      }
    }
    sets.push(`updated_at = $${idx}`);
    values.push(now);
    idx++;
    values.push(id);

    await d.execute(
      `UPDATE conversations SET ${sets.join(", ")} WHERE id = $${idx}`,
      values,
    );

    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, ...data, updated_at: now } as Conversation : c,
      ),
    }));
  },

  deleteConversation: async (id) => {
    const d = await getDb();
    await d.execute("DELETE FROM messages WHERE conversation_id = $1", [id]);
    await d.execute("DELETE FROM conversations WHERE id = $1", [id]);
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      currentConversationId: s.currentConversationId === id ? null : s.currentConversationId,
      messages: s.currentConversationId === id ? [] : s.messages,
    }));
  },

  switchConversationProvider: async (conversationId, newProviderId, newModel) => {
    const { updateConversation } = get();
    await updateConversation(conversationId, {
      provider_id: newProviderId,
      model: newModel,
    } as Partial<Conversation>);
  },

  setCurrentConversation: (id) => {
    resetActiveStream();
    set({ currentConversationId: id });
  },

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  updateMessage: (id, data) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...data } : m)),
    })),

  deleteMessage: async (messageId) => {
    const d = await getDb();
    await d.execute("DELETE FROM messages WHERE id = $1", [messageId]);
    set((s) => ({ messages: s.messages.filter((m) => m.id !== messageId) }));
  },

  streamChat: async (content: string, skipUserMessage?: boolean, displayContent?: string, attachment?: { type: string; data: string }) => {
    const { currentConversationId, messages } = get();
    if (!currentConversationId) return "";

    const d = await getDb();

    const convs: unknown[] = await d.select(
      "SELECT * FROM conversations WHERE id = $1",
      [currentConversationId],
    );
    const conv = convs.length > 0 ? normalizeConversation(convs[0]) : null;
    if (!conv) return "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provRows: any[] = await d.select(
      "SELECT * FROM providers WHERE id = $1",
      [conv.provider_id],
    );
    const rawProv = provRows[0];
    if (!rawProv) return "";
    const apiKey = rawProv.api_key ?? "";

    let thinkingSwitchKey: string | undefined;
    let thinkingEffortKey: string | undefined;
    try {
      const tp = typeof rawProv.thinking_param === "string"
        ? JSON.parse(rawProv.thinking_param)
        : rawProv.thinking_param;
      if (tp) {
        thinkingSwitchKey = tp.switch;
        thinkingEffortKey = tp.effort;
      }
    } catch { /* ignore - use defaults */ }

    const now = new Date().toISOString();
    let newMessages = messages;
    const displayUserContent = displayContent ?? content;
    let displayUserMsgId: string | undefined;

    // Save user message (skip when regenerating)
    if (!skipUserMessage) {
      const userMsgId = uuidv4();
      displayUserMsgId = userMsgId;
      const userMsg: Message = {
        id: userMsgId,
        conversation_id: currentConversationId,
        role: "user",
        content: displayUserContent,
        attachment_type: attachment?.type,
        attachment_data: attachment?.data,
        provider_id: conv.provider_id,
        created_at: now,
      };

      try {
        await d.execute(
          `INSERT INTO messages (id, conversation_id, role, content, attachment_type, attachment_data, provider_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userMsgId, currentConversationId, "user", displayUserContent, attachment?.type ?? null, attachment?.data ?? null, conv.provider_id, now],
        );
      } catch (err) {
        console.warn("[chatStore] Failed to insert user message:", err);
      }

      await d.execute(
        "UPDATE conversations SET updated_at = $1, title = COALESCE(NULLIF(title, ''), $2) WHERE id = $3",
        [now, displayUserContent.slice(0, 50), currentConversationId],
      );

      newMessages = [...messages, userMsg];
      set({ messages: newMessages, streamState: { content: "", reasoning: "", isStreaming: true, error: null, toolCallNodes: [], reasoningCursor: 0 } });
    } else {
      set({ streamState: { content: "", reasoning: "", isStreaming: true, error: null, toolCallNodes: [], reasoningCursor: 0 } });
    }

    // Build API messages — use original `content` for the user message with displayContent
    const apiMessages = buildApiMessages(conv, newMessages, content, displayUserMsgId);

    const assistantMsgId = uuidv4();
    const assistantMsg: Message = {
      id: assistantMsgId,
      conversation_id: currentConversationId,
      role: "assistant",
      content: "",
      provider_id: conv.provider_id,
      created_at: now,
    };
    get().addMessage(assistantMsg);

    // Save empty assistant message placeholder to DB
    try {
      await d.execute(
        `INSERT INTO messages (id, conversation_id, role, content, provider_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [assistantMsgId, currentConversationId, "assistant", "", conv.provider_id, now],
      );
    } catch (err) {
      console.warn("[chatStore] Failed to insert assistant message:", err);
    }

    // Clean up any previously active stream before starting a new one
    resetActiveStream();

    try {
      const eventName = `chat-stream:${currentConversationId}`;
      const { listen } = await import("@tauri-apps/api/event");

      const usage = { current: null as { prompt: number; completion: number; cached: number } | null };

      const unlisten = await listen<StreamChunk>(eventName, (event) => {
        if (get().currentConversationId !== currentConversationId) {
          unlisten();
          return;
        }
        const chunk = event.payload;

        // Handle tool call events (DB persistence + content reset)
        if (chunk.tool_call) {
          const tc = chunk.tool_call;
          const s = get();
          if (tc.status === "executing") {
            const snapshotContent = s.streamState.content;
            const snapshotReasoning = s.streamState.reasoning;
            // Save intermediate assistant(tool_calls) message to DB
            (async () => {
              try {
                const d = await getDb();
                const now = new Date().toISOString();
                const intermediateId = uuidv4();
                await d.execute(
                   `INSERT INTO messages (id, conversation_id, role, content, reasoning_content, tool_calls, provider_id, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [intermediateId, currentConversationId, "assistant", snapshotContent, snapshotReasoning || null, JSON.stringify([{ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }]), conv.provider_id, now],
                );
              } catch (err) {
                console.warn("[chatStore] Failed to insert intermediate tool message:", err);
              }
            })();
            set((s) => {
              const nodeText = snapshotReasoning || snapshotContent;
              const cursor = s.streamState.reasoningCursor;
              const nodeReasoning = nodeText.slice(cursor);
              return {
                streamState: {
                  ...s.streamState,
                  content: snapshotReasoning ? s.streamState.content : "",
                  toolCallNodes: [...s.streamState.toolCallNodes, {
                    reasoning: nodeReasoning,
                    toolName: tc.name,
                    arguments: tc.arguments,
                    toolStatus: "executing",
                    mode: snapshotReasoning ? "thinking" : "non-thinking",
                  }],
                  reasoningCursor: cursor + nodeReasoning.length,
                },
              };
            });
          } else {
            // Save tool result message to DB
            (async () => {
              try {
                const d = await getDb();
                const now = new Date().toISOString();
                const resultId = uuidv4();
                await d.execute(
                  `INSERT INTO messages (id, conversation_id, role, content, tool_call_id, provider_id, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                  [resultId, currentConversationId, "tool", tc.result || "", tc.id, conv.provider_id, now],
                );
              } catch (err) { console.warn("[chatStore] Failed to save tool result:", err); }
            })();
            set((s) => ({
              streamState: {
                ...s.streamState,
                toolCallNodes: s.streamState.toolCallNodes.map((node, i) =>
                  i === s.streamState.toolCallNodes.length - 1
                    ? { ...node, toolStatus: tc.status, toolResult: tc.result }
                    : node
                ),
              },
            }));
          }
        }

        if (chunk.done && !chunk.error) {
          if (chunk.usage_prompt || chunk.usage_completion || chunk.usage_cached) {
            usage.current = {
              prompt: chunk.usage_prompt ?? 0,
              completion: chunk.usage_completion ?? 0,
              cached: chunk.usage_cached ?? 0,
            };
          }
          set((s) => ({
            streamState: { ...s.streamState, isStreaming: false },
          }));
        } else if (chunk.error) {
          set((s) => ({
            streamState: {
              ...s.streamState,
              isStreaming: false,
              error: chunk.error,
            },
          }));
        } else {
          set((s) => {
            const newContent = chunk.content
              ? s.streamState.content + chunk.content
              : s.streamState.content;
            const newReasoning = chunk.reasoning_content
              ? s.streamState.reasoning + chunk.reasoning_content
              : s.streamState.reasoning;
            const msgs = [...s.messages];
            msgs[msgs.length - 1] = {
              ...msgs[msgs.length - 1],
              content: newContent,
              reasoning_content: newReasoning || undefined,
            };
            return {
              streamState: {
                ...s.streamState,
                content: newContent,
                reasoning: newReasoning,
              },
              messages: msgs,
            };
          });
        }
      });

      activeUnlisten = () => { unlisten(); activeUnlisten = null; };

      const finalContent = await invokeWithTimeout<string>("stream_chat", {
        input: {
          conversation_id: currentConversationId,
          base_url: rawProv.base_url,
          api_key: apiKey,
          model: conv.model,
          messages: apiMessages,
          temperature: conv.temperature,
          max_tokens: conv.max_tokens,
          top_p: conv.top_p,
          frequency_penalty: conv.frequency_penalty ?? 0,
          presence_penalty: conv.presence_penalty ?? 0,
          thinking_enabled: conv.thinking_enabled,
          reasoning_effort: conv.reasoning_effort || null,
          thinking_switch_key: thinkingSwitchKey ?? null,
          thinking_effort_key: thinkingEffortKey ?? null,
        },
      });

      const finalReasoning = get().streamState.reasoning;

      const totalTokens = usage.current ? (usage.current.prompt + usage.current.completion) : undefined;
      const usageDetails = usage.current ?? undefined;

      const toolNodesJson = get().streamState.toolCallNodes.length > 0
        ? JSON.stringify(get().streamState.toolCallNodes)
        : null;

      try {
        await d.execute(
          `UPDATE messages SET content = $1, reasoning_content = $2, tokens = $3, usage_details = $4, tool_nodes = $5 WHERE id = $6`,
          [
            finalContent,
            finalReasoning || null,
            totalTokens ?? null,
            usageDetails ? JSON.stringify(usageDetails) : null,
            toolNodesJson,
            assistantMsgId,
          ],
        );
      } catch (err) {
        console.warn("[chatStore] Failed to update assistant message:", err);
      }

      unlisten();
      activeUnlisten = null;

      set((s) => ({
        streamState: emptyStreamState(),
        messages: s.messages.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: finalContent, reasoning_content: finalReasoning || undefined, tokens: totalTokens, usage_details: usageDetails, toolNodes: s.streamState.toolCallNodes }
            : m,
        ),
      }));

      return finalContent;
    } catch (err) {
      resetActiveStream();
      set((s) => ({
        streamState: {
          ...s.streamState,
          isStreaming: false,
          error: String(err),
        },
      }));
      return "";
    }
  },

  cancelStream: () => {
    resetActiveStream();
  },

  resetStream: () => {
    set({ streamState: emptyStreamState() });
  },

  getProviderTokens: async (providerId: string) => {
    const d = await getDb();
    try {
      const rows: { total: number }[] = await d.select(
        "SELECT COALESCE(SUM(tokens), 0) AS total FROM messages WHERE provider_id = $1",
        [providerId],
      );
      return rows[0]?.total ?? 0;
    } catch {
      return 0;
    }
  },
}));
