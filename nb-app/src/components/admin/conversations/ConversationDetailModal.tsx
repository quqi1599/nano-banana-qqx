import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, User, Bot, Globe, Key } from 'lucide-react';
import { AdminConversationDetail, ConversationMessage } from '../../../services/conversationService';
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

interface ConversationDetailModalProps {
    conversation: AdminConversationDetail;
    loading: boolean;
    onClose: () => void;
}

export const ConversationDetailModal: React.FC<ConversationDetailModalProps> = ({
    conversation,
    loading,
    onClose,
}) => {
    const [imagePreview, setImagePreview] = useState<{ src: string; show: boolean } | null>(null);
    const apiKeyValue = conversation.api_key || conversation.api_key_prefix || '';
    const apiKeyPreview = conversation.api_key_prefix || (conversation.api_key ? conversation.api_key.slice(0, 8) : '');

    const handleImageClick = (base64: string, mimeType: string) => {
        setImagePreview({ src: `data:${mimeType};base64,${base64}`, show: true });
    };

    const renderMessage = (msg: ConversationMessage, idx: number) => {
        const isAdmin = msg.role === 'admin';
        return (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isAdmin
                    ? 'bg-cream-100 dark:bg-cream-900/30 text-cream-700 dark:text-cream-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
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
                                    className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:opacity-90 transition"
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
                </div>
            </div>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-100 overflow-hidden">
                {/* 头部 */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                    <div>
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
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 消息列表 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="text-center p-4">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-cream-500" />
                        </div>
                    ) : (
                        conversation.messages.map((msg, idx) => renderMessage(msg, idx))
                    )}
                </div>

                {/* 图片预览弹窗 */}
                {imagePreview && createPortal(
                    <div
                        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
                        onClick={() => setImagePreview(null)}
                    >
                        <div
                            className="relative max-w-4xl max-h-[90vh] bg-transparent"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={imagePreview.src}
                                alt="预览图片"
                                className="max-w-full max-h-full object-contain rounded-lg"
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
