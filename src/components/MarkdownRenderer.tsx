import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useMemo } from "react";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useThemeStore } from "../stores/themeStore";

function useCodeStyle() {
  const { resolvedTheme } = useThemeStore();
  return useMemo(() => resolvedTheme === "dark" ? oneDark : oneLight, [resolvedTheme]);
}

function useComponents() {
  const style = useCodeStyle();
  return useMemo<Partial<Components>>(() => ({
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const codeStr = String(children).replace(/\n$/, "");
      const inline = !match && !codeStr.includes("\n");

      if (!inline && match) {
        return (
          <SyntaxHighlighter style={style} language={match[1]} PreTag="div">
            {codeStr}
          </SyntaxHighlighter>
        );
      }

      if (!inline) {
        return (
          <SyntaxHighlighter style={style} PreTag="div">
            {codeStr}
          </SyntaxHighlighter>
        );
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  }), [style]);
}

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const components = useComponents();
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
    </div>
  );
}
