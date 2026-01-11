/**
 * 强制新对话弹窗组件
 * 当对话历史过长时，强制用户开启新对话
 */

import React from 'react';
import { MessageCirclePlus, AlertTriangle, ImageOff } from 'lucide-react';

interface NewConversationModalProps {
    messageCount: number;
    imageSizeMB: number;
    onNewConversation: () => void;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
    messageCount,
    imageSizeMB,
    onNewConversation,
}) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                {/* 图标 */}
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>

                {/* 标题 */}
                <h2 className="mb-2 text-center text-xl font-semibold text-gray-900 dark:text-white">
                    对话内容过多
                </h2>

                {/* 说明 */}
                <p className="mb-4 text-center text-gray-600 dark:text-gray-300">
                    当前对话包含大量图片数据，继续对话可能导致请求失败。建议开启新对话以获得更好的体验。
                </p>

                {/* 统计信息 */}
                <div className="mb-6 rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <MessageCirclePlus className="h-4 w-4" />
                            <span>对话消息</span>
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {messageCount} 条
                        </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <ImageOff className="h-4 w-4" />
                            <span>图片总大小</span>
                        </div>
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                            {imageSizeMB} MB
                        </span>
                    </div>
                </div>

                {/* 提示 */}
                <div className="mb-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-700 dark:text-blue-300">
                    💡 <span className="font-medium">小提示：</span>
                    开启新对话后，您可以在历史记录中查看之前的对话内容。
                </div>

                {/* 按钮 */}
                <button
                    onClick={onNewConversation}
                    className="w-full rounded-xl bg-gradient-to-r from-cream-500 to-cream-600 px-6 py-3 font-medium text-white shadow-lg shadow-cream-500/25 transition-all hover:shadow-xl hover:shadow-cream-500/30 active:scale-[0.98]"
                >
                    <span className="flex items-center justify-center gap-2">
                        <MessageCirclePlus className="h-5 w-5" />
                        开启新对话
                    </span>
                </button>
            </div>
        </div>
    );
};
