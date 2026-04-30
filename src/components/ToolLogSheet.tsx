import { useState, useEffect, useMemo } from "react";
import { useChatStore } from "../stores/chatStore";
import { useBackHandler } from "../hooks/useBackHandler";
import type { Message, ToolCallInfo } from "../types";

interface ToolLogEntry {
  id: string;
  toolName: string;
  urls: string[];
  status: "completed" | "failed" | "executing";
  result: string;
  timestamp: string;
}

function extractUrls(args?: string): string[] {
  if (!args) return [];
  try {
    const parsed = JSON.parse(args);
    return parsed.urls || (parsed.url ? [parsed.url] : []);
  } catch {
    return [];
  }
}

function isFailedResult(content: string): boolean {
  return content.startsWith("获取失败") || content.startsWith("错误") || content.startsWith("不支持的工具");
}

function buildEntries(messages: Message[]): ToolLogEntry[] {
  const toolResults = new Map<string, Message>();
  for (const msg of messages) {
    if (msg.role === "tool" && msg.tool_call_id) {
      toolResults.set(msg.tool_call_id, msg);
    }
  }

  const entries: ToolLogEntry[] = [];
  for (const msg of messages) {
    const tcs: ToolCallInfo[] = msg.tool_calls || [];
    if (tcs.length === 0) continue;

    for (const tc of tcs) {
      const result = toolResults.get(tc.id);
      const content = result?.content || "";
      entries.push({
        id: tc.id,
        toolName: tc.function?.name || "unknown",
        urls: extractUrls(tc.function?.arguments),
        status: result ? (isFailedResult(content) ? "failed" : "completed") : "executing",
        result: content,
        timestamp: result?.created_at || msg.created_at || "",
      });
    }
  }

  return entries;
}

interface ToolLogSheetProps {
  conversationId: string;
  onClose: () => void;
}

export function ToolLogSheet({ conversationId, onClose }: ToolLogSheetProps) {
  const { messages } = useChatStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedId(null);
  }, [conversationId]);

  useBackHandler(onClose, true);

  const entries = useMemo(() => buildEntries(messages), [messages]);

  return (
    <div className="tool-log-overlay" onClick={onClose}>
      <div className="tool-log-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tool-log-sheet__header">
          <h3 className="tool-log-sheet__title">工具调用日志</h3>
          <button className="btn-icon" onClick={onClose} title="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="tool-log-sheet__body">
          {entries.length === 0 && (
            <div className="tool-log-sheet__empty">暂无工具调用记录</div>
          )}

          {entries.map((entry) => (
            <div key={entry.id} className={`tool-log-item tool-log-item--${entry.status}`}>
              <div
                className="tool-log-item__summary"
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <span className="tool-log-item__icon">
                  {entry.status === "executing" ? "◌" : entry.status === "completed" ? "✓" : "✕"}
                </span>
                <span className="tool-log-item__name">{entry.toolName}</span>
                <span className="tool-log-item__status">
                  {entry.status === "completed" ? "完成" : entry.status === "failed" ? "失败" : "执行中"}
                </span>
                <span className="tool-log-item__expand">
                  {expandedId === entry.id ? "收起 ▲" : "展开 ▼"}
                </span>
              </div>

              {entry.urls.length > 0 && (
                <div className="tool-log-item__urls">
                  {entry.urls.map((url, i) => (
                    <div key={i} className="tool-log-item__url">{url}</div>
                  ))}
                </div>
              )}

              {expandedId === entry.id && entry.result && (
                <pre className="tool-log-item__detail">
                  {entry.result.length > 20000
                    ? entry.result.slice(0, 20000) + "\n\n[内容过长，已截断]"
                    : entry.result}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
