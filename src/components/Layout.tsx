import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { ToolLogSheet } from "./ToolLogSheet";
import { useChatStore } from "../stores/chatStore";
import { useProviderStore } from "../stores/providerStore";
import { useThemeStore } from "../stores/themeStore";
import { useBackHandler } from "../hooks/useBackHandler";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toolLogOpen, setToolLogOpen] = useState(false);
  const prevConvRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { conversations, loadConversations } = useChatStore();
  const { loadProviders } = useProviderStore();

  useEffect(() => {
    loadConversations();
    loadProviders();
  }, [loadConversations, loadProviders]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const { resolvedTheme, setTheme } = useThemeStore();

  const goHome = useCallback(() => {
    if (conversations.length > 0) {
      const last = conversations[0];
      navigate(`/chat/${last.id}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [conversations, navigate]);

  const toggleDrawer = () => setDrawerOpen((v) => !v);

  const closeDrawerHandler = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  useBackHandler(closeDrawerHandler, drawerOpen);

  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  const chatMatch = location.pathname.match(/^\/chat\/(.+)$/);
  const convId = chatMatch?.[1];
  const currentConv = convId ? conversations.find((c) => c.id === convId) : null;

  useEffect(() => {
    if (prevConvRef.current !== convId) {
      setToolLogOpen(false);
      prevConvRef.current = convId ?? null;
    }
  }, [convId]);

  let headerTitle = "AnyChat";
  let isSubPage = false;
  if (currentConv) {
    headerTitle = currentConv.title || "新对话";
  } else if (location.pathname.startsWith("/settings")) {
    headerTitle = location.pathname.startsWith("/settings/provider") ? "供应商配置" : "设置";
    isSubPage = true;
  }

  return (
    <div className={`layout ${drawerOpen ? "layout--drawer-open" : ""}`}>
      <Sidebar isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="layout__main">
        <header className="layout__header">
          {isSubPage ? (
            <button className="btn-icon layout__menu-btn" onClick={() => navigate(-1)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
            </button>
          ) : (
            <button className="btn-icon layout__menu-btn" onClick={toggleDrawer}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}

          <div className="layout__header-title" onClick={goHome}>
            {headerTitle}
          </div>
          {currentConv && (
            <button className="btn-icon layout__menu-btn" onClick={() => setToolLogOpen(true)} title="工具日志">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </button>
          )}
          <button className="btn-icon layout__menu-btn" onClick={toggleTheme} title={resolvedTheme === "dark" ? "切换到亮色" : "切换到暗色"}>
            {resolvedTheme === "dark" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </header>

        <main className="layout__content">
          {children}
        </main>
        {toolLogOpen && convId && (
          <ToolLogSheet conversationId={convId} onClose={() => setToolLogOpen(false)} />
        )}
      </div>
    </div>
  );
}
