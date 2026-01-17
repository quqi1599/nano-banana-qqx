/**
 * 代码查看弹窗 - 支持复制功能
 */
import React, { useState } from 'react';
import { X, Copy, Check, Globe, Key } from 'lucide-react';

interface CodeViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    code: string;
    icon?: 'globe' | 'key' | 'code';
}

export const CodeViewerModal: React.FC<CodeViewerModalProps> = ({
    isOpen,
    onClose,
    title,
    code,
    icon = 'code',
}) => {
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('复制失败:', err);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const IconComponent = icon === 'globe' ? Globe : icon === 'key' ? Key : Key;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
            onClick={handleBackdropClick}
        >
            <div
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                            <IconComponent className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
                            <p className="text-xs text-gray-500">点击下方按钮复制到剪贴板</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* 代码内容区 */}
                <div className="p-6">
                    <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
                        <code className="text-sm text-green-400 font-mono whitespace-pre-wrap break-all">
                            {code}
                        </code>
                    </div>
                </div>

                {/* 底部操作栏 */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition font-medium"
                    >
                        关闭
                    </button>
                    <button
                        onClick={handleCopy}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition ${
                            copied
                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                    >
                        {copied ? (
                            <>
                                <Check className="w-4 h-4" />
                                已复制
                            </>
                        ) : (
                            <>
                                <Copy className="w-4 h-4" />
                                复制
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

/**
 * 可点击的代码标签组件 - 点击后打开弹窗
 */
interface ClickableCodeTagProps {
    code: string;
    displayText?: string;
    modalTitle: string;
    icon?: 'globe' | 'key' | 'code';
    className?: string;
    children?: React.ReactNode;
}

export const ClickableCodeTag: React.FC<ClickableCodeTagProps> = ({
    code,
    displayText,
    modalTitle,
    icon = 'code',
    className = '',
    children,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <span
                className={`cursor-pointer hover:bg-opacity-80 transition ${className}`}
                onClick={() => setIsOpen(true)}
            >
                {children || displayText || code}
            </span>
            <CodeViewerModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={modalTitle}
                code={code}
                icon={icon}
            />
        </>
    );
};
