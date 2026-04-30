import { useCallback } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useBackHandler } from "../hooks/useBackHandler";
import type { Message } from "../types";

interface ReaderOverlayProps {
  message: Message | null;
  onClose: () => void;
  title?: string;
  model?: string;
}

export function ReaderOverlay({ message, onClose, title, model }: ReaderOverlayProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useBackHandler(handleClose, !!message);

  if (!message) return null;

  return (
    <div className="reader-overlay">
      <header className="reader-overlay__header">
        <button className="reader-overlay__back" onClick={handleClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="reader-overlay__meta">
          <div className="reader-overlay__title">{title || "阅读全文"}</div>
          {model && <div className="reader-overlay__subtitle">{model}</div>}
        </div>
      </header>
      <div className="reader-overlay__content">
        <MarkdownRenderer content={message.content} />
      </div>
    </div>
  );
}
