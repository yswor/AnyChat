import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";
import { useProviderStore } from "../stores/providerStore";
import { DEFAULT_CONVERSATION_PARAMS } from "../constants/defaults";

export function HomePage() {
  const navigate = useNavigate();
  const { conversations, loadConversations, loading, createConversation } = useChatStore();
  const { providers, activeProviderId } = useProviderStore();
  const [creating, setCreating] = useState(false);
  const autoCreated = useRef(false);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (loading || creating || autoCreated.current || providers.length === 0) return;
    const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0];
    if (!activeProvider) return;
    const defaultModel = activeProvider.default_model || activeProvider.models?.[0];
    if (!defaultModel) return;
    autoCreated.current = true;
    setCreating(true);
    createConversation(activeProvider.id, defaultModel, DEFAULT_CONVERSATION_PARAMS)
      .then((id) => {
        navigate(`/chat/${id}`, { replace: true });
      })
      .catch(() => {
        autoCreated.current = false;
        setCreating(false);
      });
  }, [loading, creating, providers, activeProviderId, navigate, createConversation]);

  const handleNewChat = async () => {
    try {
      const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0];
      if (!activeProvider) {
        navigate("/settings");
        return;
      }
      const defaultModel = activeProvider.default_model || activeProvider.models?.[0];
      if (!defaultModel) {
        navigate("/settings");
        return;
      }
      const id = await createConversation(activeProvider.id, defaultModel, DEFAULT_CONVERSATION_PARAMS);
      navigate(`/chat/${id}`);
    } catch (err) {
      console.error("Failed to create conversation:", err);
      alert(`创建对话失败: ${err}`);
    }
  };

  if (loading || creating) {
    return (
      <div className="home-empty">
        <p>加载中...</p>
      </div>
    );
  }

  if (conversations.length > 0) {
    return null;
  }

  return (
    <div className="home-empty">
      <div className="home-empty__icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.3}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <h2>欢迎使用 AnyChat</h2>
      <p className="home-empty__hint">
        {providers.length === 0 ? "请先添加供应商配置" : "点击下方按钮开始新对话"}
      </p>
      <button className="btn btn-primary" onClick={handleNewChat} style={{ marginTop: "16px" }}>
        + 新建对话
      </button>
    </div>
  );
}
