import React, { useState } from 'react';
import { X, ExternalLink, BookOpen, MessageCircle } from 'lucide-react';
import { WeChatQRModal } from './WeChatQRModal';

interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
    const [showWeChatQR, setShowWeChatQR] = useState(false);

    if (!isOpen) return null;

    const handleOpenDocs = () => {
        window.open('https://ucn2gl1gy9yi.feishu.cn/wiki/HrJcwjCjuipYr7kB417cp4iZnte?from=from_copylink', '_blank');
    };

    return (
        <>
            <div
                className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
                onClick={onClose}
            >
                <div
                    className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-800"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/20 mb-4">
                            <BookOpen className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                            欢迎使用 DEAI 🍌
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            首次使用？请先阅读技术说明文档了解如何配置和使用。
                        </p>
                    </div>

                    <div className="space-y-3">
                        <button
                            onClick={handleOpenDocs}
                            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-3 font-semibold text-white transition"
                        >
                            <ExternalLink className="h-5 w-5" />
                            <span>查看技术说明文档</span>
                        </button>

                        <button
                            onClick={() => setShowWeChatQR(true)}
                            className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-500 hover:bg-green-600 px-4 py-3 font-semibold text-white transition"
                        >
                            <MessageCircle className="h-5 w-5" />
                            <span>技术支持 / 加入交流群</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                        >
                            我已了解，开始使用
                        </button>
                    </div>

                    <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
                        此弹窗仅在首次访问时显示
                    </p>
                </div>
            </div>

            <WeChatQRModal isOpen={showWeChatQR} onClose={() => setShowWeChatQR(false)} />
        </>
    );
};
