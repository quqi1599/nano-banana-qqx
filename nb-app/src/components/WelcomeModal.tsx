import React, { useState, useEffect } from 'react';
import { X, BookOpen, MessageCircle, ChevronRight, Sparkles, ShieldCheck, SlidersHorizontal, Search } from 'lucide-react';
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
        window.open('https://ai.google.dev/gemini-api/docs/image-generation', '_blank');
    };

    return (
        <>
            <div
                className={`fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
            >
                <div
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
                    onClick={onClose}
                />

                <div
                    className={`
                        relative w-full max-w-2xl max-h-[92dvh] overflow-y-auto overflow-x-hidden
                        bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl
                        border border-white/30 dark:border-white/10 rounded-2xl shadow-2xl
                        transform transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1)
                        ${isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}
                    `}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl animate-float-slow pointer-events-none" />
                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl animate-float-slow pointer-events-none" style={{ animationDelay: '2s' }} />

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-white/10 transition-all duration-200 z-10"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    <div className="relative p-4 sm:p-8">
                        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
                            <div className="relative mb-4 sm:mb-6">
                                <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-xl animate-pulse-fast" />
                                <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/10 border border-white/50 dark:border-white/10 shadow-lg transform transition-transform hover:scale-110 duration-300">
                                    <span className="text-4xl animate-bounce" style={{ animationDuration: '3s' }}>🍌</span>
                                </div>
                                <div className="absolute -bottom-2 -right-2 bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-md border border-gray-100 dark:border-gray-700">
                                    <Sparkles className="h-4 w-4 text-amber-500" />
                                </div>
                            </div>

                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 mb-3">
                                <Sparkles className="h-3.5 w-3.5" />
                                Banana 2（3.1）新增
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-2">
                                Banana 2（3.1模型）已上线
                            </h2>
                            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 max-w-xl leading-relaxed">
                                Banana Pro（3.0）继续保留；新增 Banana 2（3.1）用于更灵活的比例与尺寸控制。
                                <span className="font-semibold text-amber-600 dark:text-amber-400"> 你可以按场景自由切换 3.0 / 3.1。</span>
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
                            <div className="rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-900/15 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Banana Pro（3.0）</span>
                                </div>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    支持最高 4K 输出，更适合追求高分辨率细节和成片质感的场景。
                                </p>
                            </div>
                            <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-900/15 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <SlidersHorizontal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Banana 2（3.1）</span>
                                </div>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    支持 512 / 1K / 2K / 4K，新增 1:4、1:8、4:1、8:1 等更极端长宽比。
                                </p>
                            </div>
                            <div className="rounded-xl border border-blue-200/60 dark:border-blue-500/20 bg-blue-50/70 dark:bg-blue-900/15 p-4 sm:col-span-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <Search className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">官方能力对齐</span>
                                </div>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    已按 Google Gemini 官方文档对齐图片模型调用参数（模型、尺寸、比例），降低空响应与不兼容风险。
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 p-4 mb-4">
                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                推荐动作：超清大图选 Banana Pro（3.0）；快速多轮编辑或超宽比例优先选 Banana 2（3.1）。
                            </p>
                        </div>

                        <div className="space-y-3 relative z-10">
                            <button
                                onClick={onClose}
                                className="w-full py-3.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                            >
                                <span>立即体验 Banana 2（3.1）</span>
                                <Sparkles className="h-4 w-4" />
                            </button>

                            <button
                                onClick={handleOpenDocs}
                                className="group w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 border border-amber-200/50 dark:border-amber-500/10 hover:border-amber-500/30 hover:shadow-md transition-all duration-300"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                                        <BookOpen className="h-5 w-5" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">查看谷歌官方文档</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">核对模型能力、尺寸与比例参数</p>
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

                        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-5 select-none">
                            此弹窗仅在首次访问时显示
                        </p>
                    </div>
                </div>
            </div>

            <WeChatQRModal isOpen={showWeChatQR} onClose={() => setShowWeChatQR(false)} />
        </>
    );
};
