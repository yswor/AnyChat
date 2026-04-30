import { useState, useRef, useCallback, useEffect } from "react";
import type { Message } from "../types";
import type React from "react";

export function useReaderMode(
  id: string | undefined,
  messagesEndRef: React.RefObject<HTMLDivElement | null>,
) {
  const [readerMode, setReaderMode] = useState(false);
  const [readerMessage, setReaderMessage] = useState<Message | null>(null);
  const readerScrollTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (readerScrollTimerRef.current) {
        clearTimeout(readerScrollTimerRef.current);
      }
    };
  }, []);

  const toggleReaderMode = useCallback(() => {
    const next = !readerMode;
    setReaderMode(next);
    if (id) {
      localStorage.setItem(`readerMode_${id}`, String(next));
    }
    if (readerScrollTimerRef.current) {
      clearTimeout(readerScrollTimerRef.current);
    }
    readerScrollTimerRef.current = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, [readerMode, id, messagesEndRef]);

  const handleOpenReader = useCallback((msg: Message) => {
    setReaderMessage(msg);
  }, []);

  const handleCloseReader = useCallback(() => {
    setReaderMessage(null);
  }, []);

  return {
    readerMode,
    readerMessage,
    toggleReaderMode,
    handleOpenReader,
    handleCloseReader,
  } as const;
}
