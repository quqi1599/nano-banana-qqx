import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Code } from 'lucide-react';

export interface MarkdownRendererProps {
  text: string;
}

// 代码块组件 - 支持复制功能
const CodeBlock: React.FC<{
  language?: string;
  value: string;
}> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden bg-gray-900 dark:bg-gray-950">
      {/* 代码块头部 - 语言标签和复制按钮 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-400">{language || 'code'}</span>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            copied
              ? 'bg-green-500/20 text-green-400'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
          title={copied ? '已复制' : '复制代码'}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              复制
            </>
          )}
        </button>
      </div>
      {/* 代码内容 */}
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm text-gray-100 font-mono whitespace-pre">
          {value}
        </code>
      </pre>
    </div>
  );
};

// 行内代码组件
const InlineCode: React.FC<{ children: string }> = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm font-mono">
    {children}
  </code>
);

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : '';

        if (inline) {
          return <InlineCode>{String(children)}</InlineCode>;
        }

        return (
          <CodeBlock
            language={language}
            value={String(children).replace(/\n$/, '')}
          />
        );
      },
    }}
  >
    {text}
  </ReactMarkdown>
);

export default MarkdownRenderer;
