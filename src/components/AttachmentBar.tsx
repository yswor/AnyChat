import { IconClose } from "./Icons";

export interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

interface AttachmentBarProps {
  file: AttachedFile | null;
  onRemove: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentBar({ file, onRemove }: AttachmentBarProps) {
  if (!file) return null;

  return (
    <div className="attachment-bar">
      <div className="attachment-bar__chip">
        <svg
          className="attachment-bar__chip-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13 2 13 9 20 9" />
        </svg>
        <span className="attachment-bar__chip-name">{file.name}</span>
        <span className="attachment-bar__chip-size">{formatSize(file.size)}</span>
        <button
          className="attachment-bar__chip-remove"
          onClick={onRemove}
          title="移除文件"
        >
          <IconClose size={14} />
        </button>
      </div>
    </div>
  );
}
