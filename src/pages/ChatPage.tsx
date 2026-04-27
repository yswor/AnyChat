import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";
import { useProviderStore } from "../stores/providerStore";
import Database from "@tauri-apps/plugin-sql";
import { ChatBubble } from "../components/ChatBubble";
import { ReaderOverlay } from "../components/ReaderOverlay";
import { ModelSelector } from "../components/ModelSelector";
import { ThinkingToggle } from "../components/ThinkingToggle";
import { SettingsModal } from "../components/SettingsModal";
import { AttachmentBar } from "../components/AttachmentBar";
import type { AttachedFile } from "../components/AttachmentBar";
import { IconSend, IconStop, IconAttach } from "../components/Icons";
import { MAX_FILE_SIZE_BYTES, ALLOWED_FILE_EXTENSIONS } from "../constants/attachments";
import type { Conversation, Message } from "../types";

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [readerMode, setReaderMode] = useState(false);
  const [readerMessage, setReaderMessage] = useState<Message | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isStreamingLocal, setIsStreamingLocal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    conversations,
    messages,
    streamState,
    loadConversations,
    loadMessages,
    updateConversation,
    setCurrentConversation,
    streamChat,
  } = useChatStore();

  const { providers } = useProviderStore();

  const conv: Conversation | undefined = conversations.find((c) => c.id === id);
  const provider = providers.find((p) => p.id === conv?.provider_id);

  useEffect(() => {
    if (id) {
      setCurrentConversation(id);
      loadMessages(id);
    }
  }, [id, loadMessages, setCurrentConversation]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (id) {
      setShowSettings(false);
    }
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamState.content]);

  useEffect(() => {
    const handleSharedText = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text && typeof text === "string") {
        setInput((prev) => prev ? `${prev}\n${text}` : text);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("shared-text", handleSharedText);
    return () => window.removeEventListener("shared-text", handleSharedText);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && !attachedFile) || streamState.isStreaming) return;

    let fullContent = trimmed;
    let displayContent = trimmed;
    if (attachedFile) {
      const sizeStr = attachedFile.size < 1024
        ? `${attachedFile.size} B`
        : `${(attachedFile.size / 1024).toFixed(1)} KB`;
      const fileHeader = `[文件: ${attachedFile.name} (${sizeStr})]`;
      displayContent = trimmed ? `${fileHeader}\n\n${trimmed}` : fileHeader;
      fullContent = `${fileHeader}\n\n${attachedFile.content}` + (trimmed ? `\n\n---\n${trimmed}` : "");
    }

    setInput("");
    setAttachedFile(null);
    setIsStreamingLocal(true);
    await streamChat(fullContent, false, displayContent);
    setIsStreamingLocal(false);
    loadConversations();
  }, [input, attachedFile, streamState.isStreaming, streamChat, loadConversations]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelChange = async (model: string) => {
    if (!id || streamState.isStreaming) return;
    await updateConversation(id, { model } as Partial<Conversation>);
  };

  const handleThinkingToggle = async (enabled: boolean) => {
    if (!id || streamState.isStreaming) return;
    await updateConversation(id, { thinking_enabled: enabled } as Partial<Conversation>);
  };

  const handleSettingsSave = async (params: {
    temperature: number;
    maxTokens: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
    systemPrompt: string;
    reasoningEffort: string;
  }) => {
    if (!id) return;
    await updateConversation(id, {
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      frequency_penalty: params.frequencyPenalty,
      presence_penalty: params.presencePenalty,
      system_prompt: params.systemPrompt,
      reasoning_effort: params.reasoningEffort,
    } as Partial<Conversation>);
  };

  const toggleReaderMode = useCallback(() => {
    const next = !readerMode;
    setReaderMode(next);
    if (id) {
      localStorage.setItem(`readerMode_${id}`, String(next));
    }
    // Scroll to bottom after layout change
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, [readerMode, id]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = MAX_FILE_SIZE_BYTES;
    if (file.size > MAX_SIZE) {
      alert(`文件过大（最大 500KB），当前文件 ${(file.size / 1024).toFixed(1)}KB`);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setAttachedFile({ name: file.name, content, size: file.size });
    };
    reader.onerror = () => {
      alert("读取文件失败，请重试");
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleRemoveFile = useCallback(() => {
    setAttachedFile(null);
  }, []);

  const handleOpenReader = useCallback((msg: Message) => {
    setReaderMessage(msg);
  }, []);

  const handleCloseReader = useCallback(() => {
    setReaderMessage(null);
  }, []);

  const handleRegenerate = async (msgIndex: number) => {
    if (!id || streamState.isStreaming) return;
    // Find the preceding user message
    let userMsgIdx = -1;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") {
        userMsgIdx = i;
        break;
      }
    }
    if (userMsgIdx === -1) return;

    const db = await Database.load("sqlite:anychat.db");
    const assistantMsg = messages[msgIndex];
    // Delete only the current assistant reply from DB
    await db.execute("DELETE FROM messages WHERE id = $1", [assistantMsg.id]);

    // Remove from local state
    const cleanMessages = messages.filter((_, i) => i !== msgIndex);
    useChatStore.setState({ messages: cleanMessages, currentConversationId: id });
    setCurrentConversation(id);

    // Silently re-send the user message (skip adding duplicate user msg)
    setIsStreamingLocal(true);
    await streamChat(messages[userMsgIdx].content, true);
    setIsStreamingLocal(false);
    loadConversations();
  };

  if (!id) {
    navigate("/");
    return null;
  }

  const isThinkingSupported = provider?.supports_thinking ?? false;

  return (
    <div className="chat-page">
      <div className="chat-page__messages">
        {messages.length === 0 && (
          <div className="chat-page__empty">
            <p>开始新对话</p>
          </div>
        )}
        {messages.map((msg, idx) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              messageIndex={idx}
              isLastBubble={idx === messages.length - 1}
              onRegenerate={handleRegenerate}
              isStreaming={
                (streamState.isStreaming || isStreamingLocal) &&
                idx === messages.length - 1 &&
                msg.role === "assistant"
              }
              streamContent={
                streamState.isStreaming ? streamState.content : undefined
              }
              streamReasoning={
                streamState.isStreaming ? streamState.reasoning : undefined
              }
              isReaderMode={readerMode}
              onOpenReader={handleOpenReader}
            />
          ))}
        {streamState.error && (
          <div className="chat-page__error">
            错误: {streamState.error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_FILE_EXTENSIONS.join(",")}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <AttachmentBar file={attachedFile} onRemove={handleRemoveFile} />

      <div className="chat-page__footer">
        <div className="chat-page__footer-actions">
          {conv && provider && (
            <ModelSelector
              models={provider.models || []}
              currentModel={conv.model}
              onSelect={handleModelChange}
              disabled={streamState.isStreaming}
            />
          )}
          <div className="chat-page__footer-spacer" />
          <button
            className={`btn-icon ${readerMode ? "btn-icon--active" : ""}`}
            onClick={toggleReaderMode}
            title={readerMode ? "关闭阅读模式" : "开启阅读模式"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </button>
            {isThinkingSupported && (
              <ThinkingToggle
                enabled={conv?.thinking_enabled ?? false}
                supportsThinking={isThinkingSupported}
                onToggle={handleThinkingToggle}
                disabled={streamState.isStreaming}
              />
            )}
          <button
            className="btn-icon"
            onClick={() => {
              if (streamState.isStreaming) return;
              setShowSettings(true);
            }}
            disabled={streamState.isStreaming}
            title="参数设置"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
              <circle cx="15" cy="6" r="2" fill="currentColor" stroke="none"/>
              <circle cx="9" cy="12" r="2" fill="currentColor" stroke="none"/>
              <circle cx="15" cy="18" r="2" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
        <div className="chat-page__input-area">
          <button
            className="btn-icon btn-icon--attach"
            onClick={handleAttachClick}
            title="上传文件"
            disabled={streamState.isStreaming}
          >
            <IconAttach size={18} />
          </button>
          <textarea
            ref={inputRef}
            className="chat-page__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
              placeholder="输入消息..."
            rows={2}
            disabled={streamState.isStreaming}
          />
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={streamState.isStreaming || !input.trim()}
          >
            {streamState.isStreaming ? <IconStop size={18} /> : <IconSend size={18} />}
          </button>
        </div>
      </div>

      {conv && (
        <SettingsModal
          key={id}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          temperature={conv.temperature}
          maxTokens={conv.max_tokens}
          topP={conv.top_p}
          frequencyPenalty={conv.frequency_penalty}
          presencePenalty={conv.presence_penalty}
          systemPrompt={conv.system_prompt}
          reasoningEffort={conv.reasoning_effort}
          thinkingEnabled={conv.thinking_enabled}
          supportsThinking={isThinkingSupported}
          onSave={handleSettingsSave}
        />
      )}
      <ReaderOverlay
        message={readerMessage}
        onClose={handleCloseReader}
        title={conv?.title || "阅读全文"}
        model={conv?.model}
      />
    </div>
  );
}
