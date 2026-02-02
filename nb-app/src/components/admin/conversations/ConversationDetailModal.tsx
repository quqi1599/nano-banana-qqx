import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, User, Bot, Globe, Key, ChevronDown, Sparkles } from 'lucide-react';
import { AdminConversationDetail, ConversationMessage, adminLoadMoreMessages } from '../../../services/conversationService';
import { DEFAULT_API_ENDPOINT } from '../../../config/api';
import { UserTypeBadge } from './utils/constants';
import { formatDate, formatFullDate } from '../../../utils/formatters';
import { CodeViewerModal, ClickableCodeTag } from '../../ui/CodeViewerModal';

// 懒加载图片组件
const LazyImage: React.FC<{
    src: string;
    alt: string;
    className?: string;
    onClick?: () => void;
}> = ({ src, alt, className, onClick }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [shouldLoad, setShouldLoad] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShouldLoad(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '50px' }
        );

        if (imgRef.current) {
            observer.observe(imgRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <img
            ref={imgRef}
            src={shouldLoad ? src : undefined}
            alt={alt}
            className={className}
            onClick={onClick}
            style={{ opacity: isLoaded ? 1 : 0.5, transition: 'opacity 0.2s' }}
            onLoad={() => setIsLoaded(true)}
        />
    );
};

// 消息骨架屏组件
const MessageSkeleton: React.FC = () => (
    <div className="flex gap-3 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        </div>
    </div>
);

// 加载更多指示器组件
const LoadMoreIndicator: React.FC<{
    loading: boolean;
    hasMore: boolean;
    onClick: () => void;
}> = ({ loading, hasMore, onClick }) => {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
                <div className="relative">
                    <div className="w-10 h-10 border-4 border-cream-200 dark:border-cream-800 rounded-full" />
                    <div className="absolute inset-0 w-10 h-10 border-4 border-cream-500 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 animate-pulse text-cream-500" />
                    正在加载更多消息...
                </p>
            </div>
        );
    }

    if (hasMore) {
        return (
            <button
                onClick={onClick}
                className="w-full py-4 flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-cream-600 dark:text-gray-400 dark:hover:text-cream-400 transition-all group"
            >
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 group-hover:bg-cream-100 dark:group-hover:bg-cream-900/30 transition">
                    <span className="text-sm">加载更多消息</span>
                    <ChevronDown className="w-4 h-4 animate-bounce" />
                </div>
            </button>
        );
    }

    return (
        <div className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
            已加载全部消息
        </div>
    );
};

interface ConversationDetailModalProps {
    conversation: AdminConversationDetail;
    loading: boolean;
    onClose: () => void;
}

export const ConversationDetailModal: React.FC<ConversationDetailModalProps> = ({
    conversation: initialConversation,
    loading: initialLoading,
    onClose,
}) => {
    const [imagePreview, setImagePreview] = useState<{ src: string; show: boolean } | null>(null);
    const [conversation, setConversation] = useState(initialConversation);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(initialConversation.message_page || 1);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const apiKeyValue = conversation.api_key || conversation.api_key_prefix || '';
    const apiKeyPreview = conversation.api_key_prefix || (conversation.api_key ? conversation.api_key.slice(0, 8) : '');

    // 计算是否还有更多消息
    const totalMessages = conversation.message_total || conversation.messages.length;
    const hasMore = conversation.messages.length < totalMessages;

    // 加载更多消息
    const loadMoreMessages = useCallback(async () => {
        if (loadingMore || !hasMore) return;

        setLoadingMore(true);
        try {
            const nextPage = currentPage + 1;
            const result = await adminLoadMoreMessages(conversation.id, nextPage, 50);

            // 合并消息，避免重复
            const existingIds = new Set(conversation.messages.map(m => m.id));
            const newMessages = result.messages.filter(m => !existingIds.has(m.id));

            setConversation(prev => ({
                ...prev,
                messages: [...prev.messages, ...newMessages],
            }));
            setCurrentPage(nextPage);
        } catch (error) {
            console.error('加载更多消息失败:', error);
        } finally {
            setLoadingMore(false);
        }
    }, [conversation.id, conversation.messages, currentPage, hasMore, loadingMore]);

    // 无限滚动监听
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            // 距离底部 100px 时触发加载
            if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loadingMore) {
                loadMoreMessages();
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [hasMore, loadingMore, loadMoreMessages]);

    const handleImageClick = (base64: string, mimeType: string) => {
        setImagePreview({ src: `data:${mimeType};base64,${base64}`, show: true });
    };

    const renderMessage = (msg: ConversationMessage, idx: number) => {
        const isAdmin = msg.role === 'admin' || msg.role === 'user';
        const isModel = msg.role === 'model' || msg.role === 'assistant';

        return (
            <div
                key={msg.id || idx}
                className={`flex gap-3 animate-fade-in-up ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                style={{ animationDelay: `${(idx % 10) * 50}ms` }}
            >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isAdmin
                    ? 'bg-cream-100 dark:bg-cream-900/30 text-cream-700 dark:text-cream-400'
                    : 'bg-gradient-to-br from-blue-500 to-purple-500 text-white'
                    }`}>
                    {isAdmin ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[80%] ${isAdmin ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
                    <div className={`p-3 rounded-2xl ${isAdmin
                        ? 'bg-brand-500 text-white rounded-tr-none'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-none'
                        }`}>
                        {msg.content && (
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        )}
                        {msg.is_thought && (
                            <span className="inline-flex items-center gap-1 text-xs opacity-70 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                思考过程 {msg.thinking_duration && `(${msg.thinking_duration.toFixed(1)}s)`}
                            </span>
                        )}
                    </div>
                    {msg.images && msg.images.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {msg.images.map((img, imgIdx) => (
                                <div
                                    key={imgIdx}
                                    className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:opacity-90 transition hover:scale-105"
                                    onClick={() => handleImageClick(img.base64, img.mimeType)}
                                >
                                    <LazyImage
                                        src={`data:${img.mimeType};base64,${img.base64}`}
                                        alt={`消息图片 ${imgIdx + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    <span className="text-[10px] text-gray-400 mt-1">
                        {formatFullDate(msg.created_at)}
                    </span>
                </div>
            </div>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                {/* 头部 */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1">
                            {conversation.title || '新对话'}
                        </h3>
                        <p className="text-xs text-gray-500">
                            {conversation.user_email} • {formatDate(conversation.created_at)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <UserTypeBadge type={conversation.user_type} />
                            {conversation.user_type === 'visitor' && conversation.visitor_id && (
                                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-900/30 text-[11px] text-gray-600 dark:text-gray-300">
                                    访客 ID: {conversation.visitor_id.slice(0, 8)}...
                                </span>
                            )}
                            {/* API Key 前缀显示（仅未登录用户且有前缀时） */}
                            {conversation.user_type !== 'user' && (conversation.api_key_prefix || conversation.api_key) && (
                                <ClickableCodeTag
                                    code={apiKeyValue}
                                    modalTitle="API Key"
                                    icon="key"
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-[11px] text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
                                >
                                    <Key className="w-3 h-3" />
                                    {apiKeyPreview}
                                </ClickableCodeTag>
                            )}
                            <ClickableCodeTag
                                code={conversation.custom_endpoint || DEFAULT_API_ENDPOINT}
                                modalTitle="自定义 API 接口地址"
                                icon="globe"
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-900/5 dark:bg-white/5 text-[11px] text-gray-500 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition"
                            >
                                <Globe className="w-3 h-3" />
                                <span className="break-all">
                                    {conversation.custom_endpoint || DEFAULT_API_ENDPOINT}
                                </span>
                            </ClickableCodeTag>
                        </div>
                        {/* 消息统计 */}
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                            <span className="px-2 py-0.5 rounded-full bg-cream-100 dark:bg-cream-900/30 text-cream-700 dark:text-cream-400">
                                共 {totalMessages} 条消息
                            </span>
                            {hasMore && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                    已加载 {conversation.messages.length} 条
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition ml-2"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 消息列表 */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
                >
                    {initialLoading ? (
                        // 初始加载骨架屏
                        <div className="space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <MessageSkeleton key={i} />
                            ))}
                        </div>
                    ) : conversation.messages.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>暂无消息</p>
                        </div>
                    ) : (
                        <>
                            {conversation.messages.map((msg, idx) => renderMessage(msg, idx))}
                            <LoadMoreIndicator
                                loading={loadingMore}
                                hasMore={hasMore}
                                onClick={loadMoreMessages}
                            />
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* 图片预览弹窗 */}
                {imagePreview && createPortal(
                    <div
                        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
                        onClick={() => setImagePreview(null)}
                    >
                        <div
                            className="relative max-w-4xl max-h-[90vh] bg-transparent animate-in zoom-in-95"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={imagePreview.src}
                                alt="预览图片"
                                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                            />
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </div>,
        document.body
    );
};
