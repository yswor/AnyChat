import { create } from "zustand";
import type { Conversation, Message, StreamChunk } from "../types";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { DEFAULT_REASONING_EFFORT } from "../constants/defaults";
import { v4 as uuidv4 } from "uuid";

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  streamState: {
    content: string;
    reasoning: string;
    isStreaming: boolean;
    error: string | null;
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

  streamChat: (content: string, skipUserMessage?: boolean, displayContent?: string) => Promise<string>;
  cancelStream: () => void;
  resetStream: () => void;
}

let db: Database | null = null;
let activeUnlisten: (() => void) | null = null;

function resetActiveStream() {
  activeUnlisten?.();
  activeUnlisten = null;
  useChatStore.setState({
    streamState: { content: "", reasoning: "", isStreaming: false, error: null },
  });
}

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:anychat.db");
  }
  return db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeConversation(row: any): Conversation {
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

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  streamState: { content: "", reasoning: "", isStreaming: false, error: null },
  loading: false,

  loadConversations: async () => {
    const d = await getDb();
    try {
      const rows: unknown[] = await d.select(
        "SELECT id, title, provider_id, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, system_prompt, thinking_enabled, reasoning_effort, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
      );
      set({ conversations: rows.map(normalizeConversation) });
    } catch {
      // Retry after ensuring schema columns exist
      try {
        await d.execute("ALTER TABLE conversations ADD COLUMN frequency_penalty REAL NOT NULL DEFAULT 0.0");
      } catch { /* already exists */ }
      try {
        await d.execute("ALTER TABLE conversations ADD COLUMN presence_penalty REAL NOT NULL DEFAULT 0.0");
      } catch { /* already exists */ }
      const rows: unknown[] = await d.select(
        "SELECT id, title, provider_id, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, system_prompt, thinking_enabled, reasoning_effort, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
      );
      set({ conversations: rows.map(normalizeConversation) });
    }
  },

  loadMessages: async (conversationId: string) => {
    const d = await getDb();
    const rows: Message[] = await d.select(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversationId],
    );
    set({ messages: rows });
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
        // Migration didn't run, add columns manually
        try {
          await d.execute("ALTER TABLE conversations ADD COLUMN frequency_penalty REAL NOT NULL DEFAULT 0.0");
        } catch {
          // Column may already exist
        }
        try {
          await d.execute("ALTER TABLE conversations ADD COLUMN presence_penalty REAL NOT NULL DEFAULT 0.0");
        } catch {
          // Column may already exist
        }
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

  streamChat: async (content: string, skipUserMessage?: boolean, displayContent?: string) => {
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
    } catch { /* ignore parse errors */ }

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
        created_at: now,
      };

      await d.execute(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userMsgId, currentConversationId, "user", displayUserContent, now],
      );

      await d.execute(
        "UPDATE conversations SET updated_at = $1, title = COALESCE(NULLIF(title, ''), $2) WHERE id = $3",
        [now, displayUserContent.slice(0, 50), currentConversationId],
      );

      newMessages = [...messages, userMsg];
      set({ messages: newMessages, streamState: { content: "", reasoning: "", isStreaming: true, error: null } });
    } else {
      set({ streamState: { content: "", reasoning: "", isStreaming: true, error: null } });
    }

    // Build API messages — use original `content` for the user message with displayContent
    const apiMessages: { role: string; content: string; reasoning_content?: string }[] = [];
    if (conv.system_prompt) {
      apiMessages.push({ role: "system", content: conv.system_prompt });
    }
    for (const msg of newMessages) {
      const m: { role: string; content: string; reasoning_content?: string } = {
        role: msg.role,
        content: (displayContent != null && msg.id === displayUserMsgId) ? content : msg.content,
      };
      if (msg.reasoning_content) {
        m.reasoning_content = msg.reasoning_content;
      }
      apiMessages.push(m);
    }

    const assistantMsgId = uuidv4();
    const assistantMsg: Message = {
      id: assistantMsgId,
      conversation_id: currentConversationId,
      role: "assistant",
      content: "",
      created_at: now,
    };
    get().addMessage(assistantMsg);

    // Save empty assistant message placeholder to DB
    await d.execute(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [assistantMsgId, currentConversationId, "assistant", "", now],
    );

    // Clean up any previously active stream before starting a new one
    resetActiveStream();

    try {
      const eventName = `chat-stream:${currentConversationId}`;
      const { listen } = await import("@tauri-apps/api/event");

      const unlisten = await listen<StreamChunk>(eventName, (event) => {
        if (get().currentConversationId !== currentConversationId) {
          unlisten();
          return;
        }
        const chunk = event.payload;
        if (chunk.done && !chunk.error) {
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
            return {
              streamState: {
                ...s.streamState,
                content: newContent,
                reasoning: newReasoning,
              },
              messages: s.messages.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: newContent, reasoning_content: newReasoning || undefined }
                  : m,
              ),
            };
          });
        }
      });

      activeUnlisten = () => { unlisten(); activeUnlisten = null; };

      const finalContent = await invoke<string>("stream_chat", {
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

      await d.execute(
        `UPDATE messages SET content = $1, reasoning_content = $2 WHERE id = $3`,
        [finalContent, finalReasoning || null, assistantMsgId],
      );

      unlisten();
      activeUnlisten = null;

      set((s) => ({
        streamState: { content: "", reasoning: "", isStreaming: false, error: null },
        messages: s.messages.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: finalContent, reasoning_content: finalReasoning || undefined }
            : m,
        ),
      }));

      return finalContent;
    } catch (err) {
      activeUnlisten?.();
      activeUnlisten = null;
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
    set({
      streamState: { content: "", reasoning: "", isStreaming: false, error: null },
    });
  },
}));
