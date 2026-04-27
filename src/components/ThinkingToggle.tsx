interface ThinkingToggleProps {
  enabled: boolean;
  supportsThinking: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export function ThinkingToggle({
  enabled,
  supportsThinking,
  onToggle,
  disabled = false,
}: ThinkingToggleProps) {
  if (!supportsThinking) return null;

  return (
    <button
      className={`thinking-toggle ${enabled ? "thinking-toggle--active" : ""}`}
      onClick={() => onToggle(!enabled)}
      disabled={disabled}
      title={enabled ? "思考模式开启中" : "思考模式已关闭"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7zM9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1z"/>
        <circle cx="8.5" cy="9.5" r="1.5"/>
        <circle cx="15.5" cy="9.5" r="1.5"/>
      </svg>
    </button>
  );
}
