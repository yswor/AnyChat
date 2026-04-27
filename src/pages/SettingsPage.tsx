import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProviderStore } from "../stores/providerStore";
import { IconClose } from "../components/Icons";

export function SettingsPage() {
  const navigate = useNavigate();
  const { providers, loading, loadProviders, removeProvider, activeProviderId, balances, fetchBalance } =
    useProviderStore();

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (loading) return;
    for (const p of providers) {
      if (p.balance_path) {
        fetchBalance(p.id);
      }
    }
  }, [providers, loading, fetchBalance]);

  return (
    <div className="settings-page">
      <h2 className="settings-page__title">AI 供应商管理</h2>

      <div className="settings-page__section">
        {loading ? (
          <p className="empty-text">加载中...</p>
        ) : providers.length === 0 ? (
          <div className="settings-page__empty">
            <p>暂无供应商</p>
            <p className="empty-text">点击下方按钮添加</p>
          </div>
        ) : (
          <div className="provider-list">
            {providers.map((p) => (
              <div key={p.id} className="provider-list-item">
                <div
                  className="provider-list-item__info"
                  onClick={() => navigate(`/settings/provider/${p.id}`)}
                >
                  <div className="provider-list-item__name">
                    {p.name}
                    {p.id === activeProviderId && (
                      <span className="provider-list-item__badge">当前</span>
                    )}
                  </div>
                  <div className="provider-list-item__url">{p.base_url}</div>
                  <div className="provider-list-item__models">
                    {p.models?.join(", ") || "暂无模型"}
                  </div>
                  {p.balance_path && (() => {
                    const bal = balances[p.id];
                    return (
                    <div className="provider-list-item__balance">
                      {bal?.loading ? (
                        <span className="provider-list-item__balance-loading">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </span>
                      ) : bal?.error ? (
                        <span className="provider-list-item__balance-error">
                          {bal?.error}
                        </span>
                      ) : bal?.data ? (
                        <span className="provider-list-item__balance-text">
                          余额: {bal.data.total_balance} {bal.data.currency}
                        </span>
                      ) : (
                        <span className="provider-list-item__balance-hint">点击刷新查询余额</span>
                      )}
                      <button
                        className="btn-icon btn-icon--sm provider-list-item__balance-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchBalance(p.id);
                        }}
                        disabled={bal?.loading}
                        title="刷新余额"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                      </button>
                    </div>
                    );
                  })()}
                </div>
                <button
                  className="btn-icon btn-icon--danger"
                  onClick={() => removeProvider(p.id)}
                  title="删除供应商"
                >
                  <IconClose size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-page__add">
        <button
          className="btn btn-primary btn-full"
          onClick={() => navigate("/settings/provider/new")}
        >
          + 添加供应商
        </button>
      </div>

      <div className="settings-page__footer">
        <p className="empty-text">
          <img src="/logo.png" alt="" className="settings-page__logo" />
          AnyChat v{__APP_VERSION__}
        </p>
      </div>
    </div>
  );
}
