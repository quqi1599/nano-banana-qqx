import React from 'react';
import { CalendarDays, Calendar, Trash2 } from 'lucide-react';
import { AdminConversation } from '../../../../../services/conversationService';
import { UserTypeBadge, getInputValue } from '../utils/constants';
import { formatFullDate, formatTime } from '../../../../../utils/formatters';

interface ConversationTimelineProps {
    timeline: Array<{
        date: string;
        conversation_count: number;
        message_count: number;
        conversations: AdminConversation[];
    }>;
    loading: boolean;
    onViewDetail: (id: string) => void;
    onDelete: (id: string) => void;
}

export const ConversationTimeline: React.FC<ConversationTimelineProps> = ({
    timeline,
    loading,
    onViewDetail,
    onDelete,
}) => {
    if (loading) {
        return (
            <div className="p-12 text-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-cream-500" />
            </div>
        );
    }

    if (timeline.length === 0) {
        return (
            <div className="p-12 text-center text-gray-400">
                <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                该用户暂无对话记录
            </div>
        );
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {timeline.map((day, idx) => (
                <div key={idx} className="p-4">
                    {/* 日期头部 */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-cream-500" />
                            <span className="font-medium text-gray-900 dark:text-white">
                                {formatFullDate(day.date)}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span>{day.conversation_count} 个对话</span>
                            <span>{day.message_count} 条消息</span>
                        </div>
                    </div>

                    {/* 当天对话列表 */}
                    <div className="space-y-2 ml-6">
                        {day.conversations.map((conv) => (
                            <div
                                key={conv.id}
                                className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                                onClick={() => onViewDetail(conv.id)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                {conv.title || '新对话'}
                                            </span>
                                            <UserTypeBadge type={conv.user_type} />
                                            {conv.model_name && (
                                                <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">
                                                    {conv.model_name.split('-').slice(0, 2).join('-')}
                                                </span>
                                            )}
                                            {conv.uses_custom_endpoint && (
                                                <span className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded" title={conv.custom_endpoint}>
                                                    <Globe className="w-3 h-3" />
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                            <span>{conv.message_count} 条消息</span>
                                            <span>{formatTime(conv.created_at)}</span>
                                            {conv.user_type === 'visitor' && conv.visitor_id && (
                                                <span className="text-[11px] text-gray-500">
                                                    访客 ID: {conv.visitor_id.slice(0, 8)}...
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded transition"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
