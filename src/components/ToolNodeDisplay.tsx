import React from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { ToolCallNode } from "../types";

function extractToolUrls(node: ToolCallNode): string[] {
  if (node.toolName !== "webfetch" || !node.arguments) return [];
  try {
    const parsed = JSON.parse(node.arguments);
    const urls: string[] = parsed.urls || (parsed.url ? [parsed.url] : []);
    return urls.slice(0, 5);
  } catch {
    return [];
  }
}

interface ToolNodeDisplayProps {
  node: ToolCallNode;
}

export function ToolNodeDisplay({ node }: ToolNodeDisplayProps) {
  const icon = node.toolStatus === "executing" ? "◌" : node.toolStatus === "completed" ? "✓" : "✕";

  return (
    <React.Fragment>
      {node.reasoning && <MarkdownRenderer content={node.reasoning} />}
      <div className="chat-bubble__tool-node">
        <div className={`chat-bubble__tool-node-status chat-bubble__tool-node-status--${node.toolStatus}`}>
          <span className="chat-bubble__tool-node-icon">{icon}</span>
          <span>调用工具: {node.toolName}</span>
          {node.toolStatus === "completed" && <span>· 完成</span>}
          {node.toolStatus === "failed" && <span>· 失败</span>}
        </div>
        {extractToolUrls(node).map((url, j) => (
          <div key={j} className="chat-bubble__tool-node-url">{url}</div>
        ))}
      </div>
    </React.Fragment>
  );
}
