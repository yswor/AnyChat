import { useState, useEffect } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { IconUser, IconBot } from "./Icons";
import type { Message } from "../types";

interface ChatBubbleProps {
  message: Message;
  isStreaming: boolean;
  streamContent?: string;
  streamReasoning?: string;
  messageIndex: number;
  isLastBubble: boolean;
  onRegenerate: (messageIndex: number) => void;
  isReaderMode?: boolean;
  onOpenReader?: (message: Message) => void;
}

export function ChatBubble({
  message,
  isStreaming,
  streamContent,
  streamReasoning,
  messageIndex,
  isLastBubble,
  onRegenerate,
  isReaderMode = false,
  onOpenReader,
}: ChatBubbleProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const content = isStreaming && isAssistant ? (streamContent ?? message.content) : message.content;
  const reasoning = isStreaming && isAssistant ? (streamReasoning || message.reasoning_content) : message.reasoning_content;
  const showReasoning = Boolean(reasoning);

  const isReaderMsg = isReaderMode && isAssistant;
  const showPreview = isReaderMsg && content.length > 120;

  useEffect(() => {
    if (isStreaming && showReasoning) {
      setReasoningExpanded(true);
    }
  }, [isStreaming, showReasoning]);

  if (message.role === "system") return null;

  return (
    <div className={`chat-bubble ${isUser ? "chat-bubble--user" : "chat-bubble--assistant"}`}>
      <div className="chat-bubble__avatar">
        {isUser ? <IconUser size={16} /> : <IconBot size={16} />}
      </div>
      <div className="chat-bubble__body">
        {showReasoning && (
          <div className="chat-bubble__reasoning">
            <div
              className="chat-bubble__reasoning-summary"
              onClick={() => setReasoningExpanded((v) => !v)}
            >
              思考过程{isStreaming ? "..." : ""}
              <span className="chat-bubble__reasoning-toggle">
                {reasoningExpanded ? "收起 ▲" : "展开 ▼"}
              </span>
            </div>
            {reasoningExpanded && (
              <div
                className="chat-bubble__reasoning-content"
                onClick={() => setReasoningExpanded(false)}
              >
                <MarkdownRenderer content={reasoning || ""} />
              </div>
            )}
          </div>
        )}
        {isReaderMsg && isStreaming && !content && !reasoning && (
          <div className="chat-bubble__content chat-bubble__content--placeholder">
            <div className="chat-bubble__preview-hint chat-bubble__preview-loading">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        {content && (
          <div
            className={`chat-bubble__content ${showPreview ? "chat-bubble__content--preview" : ""}`}
            onClick={() => {
              if (showPreview && !isStreaming && onOpenReader) {
                onOpenReader(message);
              }
            }}
          >
            <MarkdownRenderer content={content} />
            {showPreview && (
              <div className="chat-bubble__preview-hint">
                {isStreaming ? (
                  <div className="chat-bubble__preview-loading">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                ) : (
                  "点击阅读全文"
                )}
              </div>
            )}
          </div>
        )}
        {isAssistant && !isStreaming && (
          <div className="chat-bubble__actions">
            {isLastBubble && (
              <button
                className="btn-icon btn-icon--sm"
                onClick={() => onRegenerate(messageIndex)}
                title="重新生成"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            )}
            <button
              className="btn-icon btn-icon--sm"
              onClick={() => {
                navigator.clipboard.writeText(message.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title="复制内容"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52c41a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              )}
            </button>
          </div>
        )}
        {isStreaming && !content && !reasoning && !isReaderMsg && (
          <div className="chat-bubble__typing">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
      </div>
    </div>
  );
}
