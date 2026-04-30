import { useProviderStore } from "../stores/providerStore";
import { IconClose } from "./Icons";
import { useBackHandler } from "../hooks/useBackHandler";

interface ProviderSwitcherProps {
  currentProviderId: string | null;
  onSelect: (providerId: string) => void;
  onClose: () => void;
}

export function ProviderSwitcher({
  currentProviderId,
  onSelect,
  onClose,
}: ProviderSwitcherProps) {
  const { providers } = useProviderStore();
  useBackHandler(onClose, true);

  return (
    <div className="provider-switcher-overlay" onClick={onClose}>
      <div className="provider-switcher" onClick={(e) => e.stopPropagation()}>
        <div className="provider-switcher__header">
          <h3>切换 AI 供应商</h3>
          <button className="btn-close" onClick={onClose}><IconClose /></button>
        </div>
        <div className="provider-switcher__list">
          {providers.length === 0 ? (
            <p className="empty-text">暂无供应商，请先去设置页添加</p>
          ) : (
            providers.map((p) => (
              <button
                key={p.id}
                className={`provider-switcher__item ${p.id === currentProviderId ? "provider-switcher__item--active" : ""}`}
                onClick={() => {
                  onSelect(p.id);
                  onClose();
                }}
              >
                <div className="provider-switcher__item-name">{p.name}</div>
                <div className="provider-switcher__item-models">
                  {p.models?.join(", ") || "暂无模型"}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
