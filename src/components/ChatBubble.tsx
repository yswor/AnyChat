import { useState, useEffect } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { Message, ToolCallNode } from "../types";

function extractToolUrls(node: ToolCallNode): string[] {
  if (node.toolName !== "webfetch" || !node.arguments) return [];
  try {
    const parsed = JSON.parse(node.arguments);
    const urls: string[] = parsed.urls || (parsed.url ? [parsed.url] : []);
    return urls.slice(0, 3);
  } catch { return []; }
}

interface ChatBubbleProps {
  message: Message;
  isStreaming: boolean;
  streamContent?: string;
  streamReasoning?: string;
  messageIndex: number;
  isLastBubble: boolean;
  onRegenerate: (messageIndex: number) => void;
  onDelete?: (messageIndex: number) => void;
  isReaderMode?: boolean;
  onOpenReader?: (message: Message) => void;
  toolCallNodes?: ToolCallNode[];
}

export function ChatBubble({
  message,
  isStreaming,
  streamContent,
  streamReasoning,
  messageIndex,
  isLastBubble,
  onRegenerate,
  onDelete,
  isReaderMode = false,
  onOpenReader,
  toolCallNodes,
}: ChatBubbleProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const content = isStreaming && isAssistant ? (streamContent ?? message.content) : message.content;
  const reasoning = isStreaming && isAssistant ? (streamReasoning || message.reasoning_content) : message.reasoning_content;
  const showReasoning = Boolean(reasoning);
  const toolNodes = toolCallNodes ?? message.toolNodes;

  const isReaderMsg = isReaderMode && isAssistant;
  const showPreview = isReaderMsg && content.length > 120;

  useEffect(() => {
    if (isStreaming && showReasoning) {
      setReasoningExpanded(true);
    }
  }, [isStreaming, showReasoning]);

  if (message.role === "system") return null;
  if (message.role === "tool") return null;
  if (message.role === "assistant" && message.tool_calls && message.tool_calls.length > 0) return null;

  return (
    <div className={`chat-bubble ${isUser ? "chat-bubble--user" : "chat-bubble--assistant"}`}>
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
        {toolNodes && toolNodes.length > 0 && (
          <div className="chat-bubble__tool-calls">
            {toolNodes.map((node, i) => (
              <div key={i} className="chat-bubble__tool-node">
                {node.reasoning && (
                  <div className="chat-bubble__tool-node-reasoning">
                    <MarkdownRenderer content={node.reasoning} />
                  </div>
                )}
                <div className={`chat-bubble__tool-node-status chat-bubble__tool-node-status--${node.toolStatus}`}>
                  <span className="chat-bubble__tool-node-icon">
                    {node.toolStatus === "executing" ? "◌" : node.toolStatus === "completed" ? "✓" : "✕"}
                  </span>
                  <span>调用工具: {node.toolName}</span>
                  {node.toolStatus === "completed" && <span>· 完成</span>}
                  {node.toolStatus === "failed" && <span>· 失败</span>}
                </div>
                {extractToolUrls(node).map((url, j) => (
                  <div key={j} className="chat-bubble__tool-node-url">{url}</div>
                ))}
              </div>
            ))}
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
        {!isStreaming && (
          <div className="chat-bubble__actions">
            {isAssistant && isLastBubble && (
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
            {onDelete && (
              <button
                className="btn-icon btn-icon--sm btn-icon--danger"
                onClick={() => onDelete(messageIndex)}
                title="删除消息"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
            {isAssistant && message.usage_details && (
              <span className="chat-bubble__token-text">
                输入 {message.usage_details.prompt.toLocaleString()} · 输出 {message.usage_details.completion.toLocaleString()}
                {message.usage_details.cached > 0 && <> · 缓存命中 {message.usage_details.cached.toLocaleString()}</>}
              </span>
            )}
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
