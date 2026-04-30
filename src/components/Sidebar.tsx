import { useNavigate, useLocation } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";
import { useProviderStore } from "../stores/providerStore";
import { IconGear, IconClose } from "./Icons";
import { getDb } from "../db";
import { useRef, useState, useCallback } from "react";
import { useBackHandler } from "../hooks/useBackHandler";
import { DEFAULT_CONVERSATION_PARAMS } from "../constants/defaults";
import type { Conversation } from "../types";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { conversations, loadConversations, createConversation, deleteConversation } = useChatStore();
  const { providers, activeProviderId } = useProviderStore();
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeProvider = providers.find((p) => p.id === activeProviderId);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((conv: Conversation) => {
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      setSelectedConv(conv);
      setShowOptions(true);
    }, 600);
  }, [clearLongPress]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleContextMenu = useCallback((e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    setSelectedConv(conv);
    setShowOptions(true);
  }, []);

  const handleNewChat = async () => {
    try {
      const provider = activeProvider || providers[0];
      if (!provider) {
        onClose();
        navigate("/settings");
        return;
      }
      const defaultModel = provider.default_model || provider.models?.[0];
      if (!defaultModel) {
        onClose();
        navigate("/settings");
        return;
      }

      // Reuse existing empty conversation if one exists
      const db = await getDb();
      try {
        const rows: { id: string }[] = await db.select(
          "SELECT id FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM messages) ORDER BY updated_at DESC LIMIT 1",
        );
        if (rows.length > 0) {
          onClose();
          navigate(`/chat/${rows[0].id}`, { replace: true });
          return;
        }
      } catch { /* fall through to create new */ }

      const id = await createConversation(provider.id, defaultModel, DEFAULT_CONVERSATION_PARAMS);
      onClose();
      navigate(`/chat/${id}`, { replace: true });
      loadConversations();
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  };

  const handleSelectDelete = () => {
    setShowOptions(false);
    setShowConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedConv) return;
    await deleteConversation(selectedConv.id);
    setShowConfirm(false);
    setSelectedConv(null);
    loadConversations();
  };

  const handleCancelDelete = useCallback(() => {
    setShowConfirm(false);
    setSelectedConv(null);
  }, []);

  useBackHandler(handleCancelDelete, showConfirm);

  const handleCloseOptions = useCallback(() => {
    setShowOptions(false);
    setSelectedConv(null);
  }, []);

  useBackHandler(handleCloseOptions, showOptions);

  const handleSelectConv = (id: string) => {
    navigate(`/chat/${id}`, { replace: true });
    onClose();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return d.toLocaleDateString("zh-CN");
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__header">
          <div className="sidebar__brand">
            <img src="/logo.png" alt="" className="sidebar__logo" />
            <span className="sidebar__title">AnyChat</span>
          </div>
        </div>

        <div className="sidebar__new">
          <button
            className="btn btn-primary btn-full"
            onClick={handleNewChat}
          >
            + 新建对话
          </button>
        </div>

        <div className="sidebar__list">
          {conversations.length === 0 ? (
            <p className="empty-text" style={{ padding: "16px", textAlign: "center" }}>
              暂无对话
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`sidebar__item ${location.pathname === `/chat/${conv.id}` ? "sidebar__item--active" : ""}`}
                onClick={() => handleSelectConv(conv.id)}
                onTouchStart={() => handleTouchStart(conv)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}
                onContextMenu={(e) => handleContextMenu(e, conv)}
              >
                <div className="sidebar__item-content">
                  <div className="sidebar__item-title">
                    {conv.title || "新对话"}
                  </div>
                  <div className="sidebar__item-meta">
                    <span className="sidebar__item-model">{conv.model}</span>
                    <span className="sidebar__item-date">{formatDate(conv.updated_at)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar__footer">
          <span className="empty-text" style={{ flex: 1 }}>AnyChat v{__APP_VERSION__}</span>
          <button
            className="btn-icon"
            onClick={() => { navigate("/settings"); onClose(); }}
            title="设置"
          >
            <IconGear size={16} />
          </button>
        </div>
      </aside>

      {/* 长按选项框 */}
      {showOptions && selectedConv && (
        <div className="modal-overlay" onClick={handleCloseOptions}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h3>{selectedConv.title || "新对话"}</h3>
              <button className="btn-close" onClick={handleCloseOptions}>
                <IconClose size={16} />
              </button>
            </div>
            <div className="modal__body">
              <button
                className="btn btn-danger btn-full"
                onClick={handleSelectDelete}
              >
                删除对话
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showConfirm && selectedConv && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h3>确认删除</h3>
              <button className="btn-close" onClick={handleCancelDelete}>
                <IconClose size={16} />
              </button>
            </div>
            <div className="modal__body">
              <p className="empty-text">
                确定要删除对话「{selectedConv.title || "新对话"}」吗？此操作无法撤销。
              </p>
            </div>
            <div className="modal__footer">
              <button className="btn btn-secondary" onClick={handleCancelDelete}>
                取消
              </button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
