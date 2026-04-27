interface ModelSelectorProps {
  models: string[];
  currentModel: string;
  onSelect: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  models,
  currentModel,
  onSelect,
  disabled = false,
}: ModelSelectorProps) {
  if (models.length === 0) {
    return <span className="model-selector__empty">暂无模型</span>;
  }

  return (
    <select
      className="model-selector"
      value={currentModel}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
    >
      {models.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
