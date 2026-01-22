import React, { useState, useEffect } from 'react';
import { X, ExternalLink, BookOpen, MessageCircle, ChevronRight, Sparkles } from 'lucide-react';
import { WeChatQRModal } from './WeChatQRModal';

interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
    const [showWeChatQR, setShowWeChatQR] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    const handleOpenDocs = () => {
        window.open('https://ucn2gl1gy9yi.feishu.cn/wiki/HrJcwjCjuipYr7kB417cp4iZnte?from=from_copylink', '_blank');
    };

    return (
        <>
            <div
                className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
            >
                {/* Backdrop with blur */}
                <div
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
                    onClick={onClose}
                />

                {/* Modal Content */}
                <div
                    className={`
                        relative w-full max-w-lg overflow-hidden
                        bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl
                        border border-white/20 dark:border-white/10
                        rounded-2xl shadow-2xl
                        transform transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1)
                        ${isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}
                    `}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Decorative Elements */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl animate-float-slow pointer-events-none" />
                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl animate-float-slow pointer-events-none" style={{ animationDelay: '2s' }} />

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-white/10 transition-all duration-200 z-10"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    <div className="relative p-6 sm:p-8">
                        {/* Header Section */}
                        <div className="flex flex-col items-center text-center mb-8">
                            <div className="relative mb-6">
                                <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-xl animate-pulse-fast" />
                                <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/10 border border-white/50 dark:border-white/10 shadow-lg transform transition-transform hover:scale-110 duration-300">
                                    <span className="text-4xl animate-bounce" style={{ animationDuration: '3s' }}>🍌</span>
                                </div>
                                <div className="absolute -bottom-2 -right-2 bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-md border border-gray-100 dark:border-gray-700">
                                    <Sparkles className="h-4 w-4 text-amber-500" />
                                </div>
                            </div>

                            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-3">
                                欢迎使用 DEAI
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 max-w-sm leading-relaxed">
                                从一句话开始您的创意之旅。
                                <br />
                                <span className="text-xs opacity-75">首次使用建议先阅读技术文档了解配置方法。</span>
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3 relative z-10">
                            <button
                                onClick={handleOpenDocs}
                                className="group w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 border border-amber-200/50 dark:border-amber-500/10 hover:border-amber-500/30 hover:shadow-md transition-all duration-300"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                                        <BookOpen className="h-5 w-5" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">技术说明文档</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">了解如何配置和使用</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
                            </button>

                            <button
                                onClick={() => setShowWeChatQR(true)}
                                className="group w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 border border-green-200/50 dark:border-green-500/10 hover:border-green-500/30 hover:shadow-md transition-all duration-300"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                                        <MessageCircle className="h-5 w-5" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">加入交流群</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">获取技术支持和更新</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-green-500 group-hover:translate-x-1 transition-all" />
                            </button>
                        </div>

                        {/* Footer Button */}
                        <div className="mt-8">
                            <button
                                onClick={onClose}
                                className="w-full py-3.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                            >
                                <span>开始探索</span>
                                <Sparkles className="h-4 w-4" />
                            </button>
                            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4 select-none">
                                此弹窗仅在首次访问时显示
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <WeChatQRModal isOpen={showWeChatQR} onClose={() => setShowWeChatQR(false)} />
        </>
    );
};
