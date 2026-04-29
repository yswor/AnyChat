import { useState, useRef, useCallback, useEffect } from "react";

/**
 * 管理消息列表的自动滚动行为。
 * - 新消息到达时自动滚到底部（用户未手动离开底部时）
 * - 提供 FAB "滚动到底部" 按钮的状态
 * - 防抖避免手动滚动与自动滚动冲突
 */
export function useAutoScroll(deps: React.DependencyList) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const isAtBottomRef = useRef(true);
  const isManualScrollingRef = useRef(false);

  // 依赖变化时自动滚动（仅当用户位于底部）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, deps);

  /** 监听滚动位置，更新 at-bottom 状态和 FAB 显示 */
  const handleMessagesScroll = useCallback(() => {
    if (isManualScrollingRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = Math.max(50, el.clientHeight * 0.1);
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isAtBottomRef.current = atBottom;
    setShowScrollFab(!atBottom);
  }, []);

  /** 滚动到底部，并短暂禁用自动跟随防干扰 */
  const scrollToBottom = useCallback(() => {
    isManualScrollingRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollFab(false);
    setTimeout(() => {
      isManualScrollingRef.current = false;
    }, 500);
  }, []);

  return {
    messagesEndRef,
    messagesContainerRef,
    showScrollFab,
    handleMessagesScroll,
    scrollToBottom,
  };
}
