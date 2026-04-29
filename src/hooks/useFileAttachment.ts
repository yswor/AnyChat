import { useState, useCallback, useRef } from "react";
import type { AttachedFile } from "../components/AttachmentBar";
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_FILE_EXTENSIONS,
} from "../constants/attachments";

/**
 * 管理文件上传状态：选择、读取、验证、清除。
 * - 限制文件大小（MAX_FILE_SIZE_BYTES）
 * - 仅支持文本文件（readAsText）
 * - 提供 fileInputRef 供隐藏 <input> 绑定
 */
export function useFileAttachment() {
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 点击触发隐藏的文件选择器 */
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /** 文件选择后的读取和验证 */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(
          `文件过大（最大 ${Math.round(MAX_FILE_SIZE_BYTES / 1024)}KB），当前文件 ${(file.size / 1024).toFixed(1)}KB`,
        );
        e.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setAttachedFile({ name: file.name, content, size: file.size });
      };
      reader.onerror = () => {
        alert("读取文件失败，请重试");
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [],
  );

  /** 移除已选择的文件 */
  const handleRemoveFile = useCallback(() => {
    setAttachedFile(null);
  }, []);

  return {
    attachedFile,
    setAttachedFile,
    fileInputRef,
    handleAttachClick,
    handleFileChange,
    handleRemoveFile,
    /** 允许的文件扩展名列表（用于 input accept 属性） */
    allowedExtensions: ALLOWED_FILE_EXTENSIONS,
  };
}
