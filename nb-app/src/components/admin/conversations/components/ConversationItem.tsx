import React from 'react';
import { MessageSquare, Hash, User, Clock, Trash2, Globe } from 'lucide-react';
import { AdminConversation } from '../../../../../services/conversationService';
import { UserTypeBadge, getInputValue } from '../../utils/constants';
import { formatDate } from '../../../../../utils/formatters';

interface ConversationItemProps {
    conversation: AdminConversation;
    onViewDetail: (id: string) => void;
    onDelete: (id: string, e?: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
    conversation,
    onViewDetail,
    onDelete,
}) => {
    return (
        <div
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition cursor-pointer"
            onClick={() => onViewDetail(conversation.id)}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 dark:text-white truncate">
                            {conversation.title || '新对话'}
                        </h4>
                        <UserTypeBadge type={conversation.user_type} />
                        {conversation.model_name && (
                            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded">
                                {conversation.model_name}
                            </span>
                        )}
                        {conversation.uses_custom_endpoint && (
                            <span
                                className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded cursor-help hover:underline"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(conversation.custom_endpoint || '');
                                }}
                                title={conversation.custom_endpoint}
                            >
                                <Globe className="w-3 h-3" />
                                自定义接口
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {conversation.user_email?.split('@')[0]}
                        </span>
                        {conversation.user_type === 'visitor' && conversation.visitor_id && (
                            <span className="text-xs text-gray-400">
                                访客 ID: {conversation.visitor_id.slice(0, 8)}...
                            </span>
                        )}
                        {/* API Key 前缀显示（仅未登录用户且有前缀时） */}
                        {conversation.user_type === 'visitor' && conversation.api_key_prefix && (
                            <span
                                className="flex items-center gap-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(conversation.api_key_prefix || '');
                                }}
                                title="点击复制 API Key 前缀"
                            >
                                <Key className="w-3 h-3" />
                                {conversation.api_key_prefix}
                            </span>
                        )}
                        <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {conversation.message_count} 条消息
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(conversation.updated_at)}
                        </span>
                    </div>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conversation.id); }}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-lg transition"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
