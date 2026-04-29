import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

/**
 * 将 Uint8Array 安全地编码为 Base64 字符串。
 * 修复了原始实现中 String.fromCharCode 在 >0xFF 字节时损坏 UTF-8 的问题。
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 监听 Tauri 后端发来的 `webfetch-request` 事件。
 * 当 Rust 侧的 reqwest 无法抓取 Cloudflare 等保护的 URL 时，
 * 回退到前端 fetch() 抓取并将结果通过 `webfetch_result` 命令送回后端。
 */
export function useWebViewFetchFallback() {
  useEffect(() => {
    const unlisten = listen<{ id: string; url: string }>(
      "webfetch-request",
      async (event) => {
        const { id, url } = event.payload;
        try {
          const resp = await fetch(url);
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          const bodyBase64 = uint8ArrayToBase64(bytes);
          const contentType = resp.headers.get("content-type") || "";
          await invoke("webfetch_result", {
            id,
            status: resp.status,
            content_type: contentType,
            body_base64: bodyBase64,
          });
        } catch {
          await invoke("webfetch_result", {
            id,
            status: 0,
            content_type: "",
            body_base64: "",
          }).catch(() => {});
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
