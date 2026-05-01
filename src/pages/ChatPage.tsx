import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";
import { useProviderStore } from "../stores/providerStore";
import { ProviderSwitcher } from "../components/ProviderSwitcher";
import { ChatBubble } from "../components/ChatBubble";
import { ReaderOverlay } from "../components/ReaderOverlay";
import { ModelSelector } from "../components/ModelSelector";
import { ThinkingToggle } from "../components/ThinkingToggle";
import { SettingsModal } from "../components/SettingsModal";
import { AttachmentBar } from "../components/AttachmentBar";
import {
  IconSend,
  IconStop,
  IconAttach,
  IconReader,
  IconSettings,
  IconGear,
  IconArrowDown,
} from "../components/Icons";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { useFileAttachment } from "../hooks/useFileAttachment";
import { useReaderMode } from "../hooks/useReaderMode";
import type { Conversation, Message } from "../types";

function isVisibleMessage(m: Message) {
  if (m.role === "system" || m.role === "tool") return false;
  if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) return false;
  return true;
}

function isLastVisibleBubble(idx: number, msgs: Message[]) {
  for (let i = idx + 1; i < msgs.length; i++) {
    if (isVisibleMessage(msgs[i])) return false;
  }
  return true;
}

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const handleCloseSettings = useCallback(() => setShowSettings(false), []);
  const [isStreamingLocal, setIsStreamingLocal] = useState(false);
  const [showProviderSwitcher, setShowProviderSwitcher] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    conversations,
    messages,
    streamState,
    loadConversations,
    loadMessages,
    updateConversation,
    setCurrentConversation,
    streamChat,
    switchConversationProvider,
  } = useChatStore();

  const { providers } = useProviderStore();

  // ---- 统一流式忙状态 ----
  const isBusy = streamState.isStreaming || isStreamingLocal;

  // ---- 自定义 Hooks ----
  const {
    messagesEndRef,
    messagesContainerRef,
    showScrollFab,
    handleMessagesScroll,
    scrollToBottom,
  } = useAutoScroll([messages.length, streamState.content]);

  const {
    attachedFile,
    setAttachedFile,
    fileInputRef,
    handleAttachClick,
    handleFileChange,
    handleRemoveFile,
    allowedExtensions,
  } = useFileAttachment();

  const {
    readerMode,
    readerMessage,
    toggleReaderMode,
    handleOpenReader,
    handleCloseReader,
  } = useReaderMode(id, messagesEndRef);

  const conv: Conversation | undefined = conversations.find(
    (c) => c.id === id,
  );
  const provider = providers.find((p) => p.id === conv?.provider_id);

  // ---- Effects ----

  useEffect(() => {
    if (id) {
      setCurrentConversation(id);
      loadMessages(id);
      setShowSettings(false);
    }
  }, [id, loadMessages, setCurrentConversation]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const handleSharedText = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text && typeof text === "string") {
        setInput((prev) => (prev ? `${prev}\n${text}` : text));
        inputRef.current?.focus();
      }
    };
    window.addEventListener("shared-text", handleSharedText);
    return () => window.removeEventListener("shared-text", handleSharedText);
  }, []);

  // ---- Handlers ----

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && !attachedFile) || isBusy) return;

    let fullContent = trimmed;
    let displayContent = trimmed;
    if (attachedFile) {
      const sizeStr =
        attachedFile.size < 1024
          ? `${attachedFile.size} B`
          : `${(attachedFile.size / 1024).toFixed(1)} KB`;
      const fileHeader = `[文件: ${attachedFile.name} (${sizeStr})]`;
      displayContent = trimmed
        ? `${fileHeader}\n\n${trimmed}`
        : fileHeader;
      fullContent =
        `${fileHeader}\n\n${attachedFile.content}` +
        (trimmed ? `\n\n---\n${trimmed}` : "");
    }

    setInput("");
    setAttachedFile(null);
    setIsStreamingLocal(true);
    await streamChat(
      fullContent,
      false,
      displayContent,
      attachedFile
        ? { type: "file", data: attachedFile.content }
        : undefined,
    );
    setIsStreamingLocal(false);
    loadConversations();
  }, [input, attachedFile, isBusy, streamChat, loadConversations, setAttachedFile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelChange = async (model: string) => {
    if (!id || isBusy) return;
    await updateConversation(id, { model } as Partial<Conversation>);
  };

  const handleThinkingToggle = async (enabled: boolean) => {
    if (!id || isBusy) return;
    await updateConversation(id, {
      thinking_enabled: enabled,
    } as Partial<Conversation>);
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

  const handleDelete = useCallback(
    async (msgIndex: number) => {
      const msg = useChatStore.getState().messages[msgIndex];
      if (!msg) return;
      const { deleteMessage } = useChatStore.getState();
      await deleteMessage(msg.id);
    },
    [],
  );

  const handleSwitchProvider = useCallback(
    async (newProviderId: string) => {
      const newProv = providers.find((p) => p.id === newProviderId);
      if (!newProv || !id) return;
      const newModel = newProv.default_model || newProv.models?.[0];
      if (!newModel) return;
      await switchConversationProvider(id, newProviderId, newModel);
      loadConversations();
    },
    [providers, id, switchConversationProvider, loadConversations],
  );

  /** @fix 边界情况：当 msgIndex=0 时无前驱 user 消息，静默返回 →
   *  改为带警告的提前退出 */
  const handleRegenerate = useCallback(async (msgIndex: number) => {
    if (!id || isBusy) return;
    const { messages, deleteMessage, setCurrentConversation, streamChat, loadConversations } = useChatStore.getState();
    let userMsgIdx = -1;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") {
        userMsgIdx = i;
        break;
      }
    }
    if (userMsgIdx === -1) {
      console.warn("handleRegenerate: no preceding user message found for msgIndex", msgIndex);
      return;
    }

    const assistantMsg = messages[msgIndex];
    await deleteMessage(assistantMsg.id);
    setCurrentConversation(id);

    setIsStreamingLocal(true);
    await streamChat(messages[userMsgIdx].content, true);
    setIsStreamingLocal(false);
    loadConversations();
  }, [id, isBusy]);

  if (!id) {
    navigate("/");
    return null;
  }

  const isThinkingSupported = provider?.supports_thinking ?? false;

  return (
    <div className="chat-page">
      <div
        className="chat-page__messages"
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
      >
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
            isLastBubble={isLastVisibleBubble(idx, messages)}
            onRegenerate={handleRegenerate}
            isStreaming={
              isBusy &&
              isLastVisibleBubble(idx, messages) &&
              msg.role === "assistant"
            }
            streamContent={
              streamState.isStreaming ? streamState.content : undefined
            }
            streamReasoning={
              streamState.isStreaming ? streamState.reasoning : undefined
            }
            toolCallNodes={
              isBusy &&
              isLastVisibleBubble(idx, messages) &&
              msg.role === "assistant"
                ? streamState.toolCallNodes
                : undefined
            }
            isReaderMode={readerMode}
            onOpenReader={handleOpenReader}
            onDelete={handleDelete}
          />
        ))}
        <div ref={messagesEndRef} />
        {showScrollFab && (
          <div className="chat-page__scroll-fab-wrap">
            <button
              className="chat-page__scroll-fab"
              onClick={scrollToBottom}
              title="滚动到底部"
            >
              <IconArrowDown size={14} />
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={allowedExtensions.join(",")}
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
              disabled={isBusy}
            />
          )}
          <div className="chat-page__footer-spacer" />
          {conv && providers.length > 1 && (
            <button
              className="btn-icon"
              onClick={() => { if (isBusy) return; setShowProviderSwitcher(true); }}
              disabled={isBusy}
              title="切换供应商"
            >
              <IconGear size={16} />
            </button>
          )}
          <button
            className={`btn-icon ${readerMode ? "btn-icon--active" : ""}`}
            onClick={toggleReaderMode}
            title={readerMode ? "关闭阅读模式" : "开启阅读模式"}
          >
            <IconReader size={18} />
          </button>
          {isThinkingSupported && (
            <ThinkingToggle
              enabled={conv?.thinking_enabled ?? false}
              supportsThinking={isThinkingSupported}
              onToggle={handleThinkingToggle}
              disabled={isBusy}
            />
          )}
          <button
            className="btn-icon"
            onClick={() => {
              if (isBusy) return;
              setShowSettings(true);
            }}
            disabled={isBusy}
            title="参数设置"
          >
            <IconSettings size={18} />
          </button>
        </div>
        <div className="chat-page__input-area">
          <button
            className="btn-icon btn-icon--attach"
            onClick={handleAttachClick}
            title="上传文件"
            disabled={isBusy}
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
            disabled={isBusy}
          />
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={isBusy || !input.trim()}
          >
            {isBusy ? <IconStop size={18} /> : <IconSend size={18} />}
          </button>
        </div>
      </div>

      {conv && (
        <SettingsModal
          key={id}
          isOpen={showSettings}
           onClose={handleCloseSettings}
          temperature={conv.temperature}
          maxTokens={conv.max_tokens}
          topP={conv.top_p}
          frequencyPenalty={conv.frequency_penalty}
          presencePenalty={conv.presence_penalty}
          systemPrompt={conv.system_prompt}
          reasoningEffort={conv.reasoning_effort}
          thinkingEnabled={conv.thinking_enabled}
          supportsThinking={isThinkingSupported}
          reasoningEffortOptions={provider?.reasoning_effort_options}
          onSave={handleSettingsSave}
        />
      )}
      <ReaderOverlay
        message={readerMessage}
        onClose={handleCloseReader}
        title={conv?.title || "阅读全文"}
        model={conv?.model}
      />
      {showProviderSwitcher && id && (
        <ProviderSwitcher
          currentProviderId={conv?.provider_id ?? null}
          onSelect={handleSwitchProvider}
          onClose={() => setShowProviderSwitcher(false)}
        />
      )}
    </div>
  );
}
