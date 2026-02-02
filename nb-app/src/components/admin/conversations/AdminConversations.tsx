/**
 * Admin Conversations - 管理员查看对话列表
 * Refactored into smaller components for better maintainability
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, X, MessageSquare, Loader2, Calendar, MessageCircle, Bot, Globe, List, CalendarDays, Trash2, User, Clock } from 'lucide-react';
import { UserTypeBadge, getInputValue } from './utils/constants';
import { Pagination } from '../common';
import { useConversationFilters } from './hooks/useConversationFilters';
import { useConversationData } from './hooks/useConversationData';
import { ConversationList } from './ConversationList';
import { ConversationTimeline } from './ConversationTimeline';
import { ConversationDetailModal } from './ConversationDetailModal';
import { FiltersPanel } from './FiltersPanel';
import { formatDate, formatFullDate, formatTime } from '../../../utils/formatters';
import { ADMIN_CONFIG } from '../../../constants/admin';
import type { AdminConversationDetail } from '../../../services/conversationService';

type ViewMode = 'list' | 'timeline';

interface AdminConversationsProps {
    userId?: string | null;
    userInfo?: { email: string; nickname?: string | null } | null;
    onClearUserFilter?: () => void;
}

export const AdminConversations: React.FC<AdminConversationsProps> = ({
    userId,
    userInfo,
    onClearUserFilter,
}) => {
    // View mode state
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [page, setPage] = useState(1);
    const pageSize = ADMIN_CONFIG.PAGE_SIZE;

    // Filters
    const {
        filters,
        setFilters,
        updateFilter,
        clearFilters,
        hasActiveFilters,
        searchQuery,
        setSearchQuery,
        showFilters,
        setShowFilters,
    } = useConversationFilters(userId);

    // Data loading
    const {
        conversations,
        selectedConversation,
        loading,
        loadingDetail,
        error,
        setError,
        loadConversations,
        loadConversationDetail,
        handleDeleteConversation,
        stats,
        timeline,
        timelineLoading,
        timelineTotal,
        total,
    } = useConversationData(filters, searchQuery, userId, page, pageSize, viewMode);

    // Local state for modal visibility (separate from the hook's selectedConversation)
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Load conversations when filters or viewMode changes
    // Note: loadConversations is wrapped in useCallback in the hook, stable reference
    useEffect(() => {
        if (viewMode === 'list') {
            loadConversations();
        }
        // Timeline is loaded automatically by the hook when userId changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, filters, searchQuery, userId, page, pageSize]);

    const reloadCurrentView = useCallback(() => {
        if (viewMode === 'list') {
            loadConversations();
        }
    }, [viewMode, loadConversations]);

    // Handle viewing conversation detail
    const handleViewDetail = useCallback(async (id: string) => {
        // 立即显示弹窗，提供即时反馈
        setShowDetailModal(true);
        // 然后加载数据（弹窗会显示 loading 状态）
        await loadConversationDetail(id);
    }, [setShowDetailModal, loadConversationDetail]);

    // Handle closing modal
    const handleCloseModal = useCallback(() => {
        setShowDetailModal(false);
    }, []);

    return (
        <div className="space-y-4">
            {/* 错误提示 */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3 animate-fade-in-up">
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></span>
                    {error}
                    <button
                        onClick={() => setError('')}
                        className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500 hover:text-red-700 transition"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* 用户筛选信息条 */}
            {userId && userInfo && (
                <div className="flex items-center justify-between p-4 bg-cream-50 dark:bg-cream-900/20 border border-cream-200 dark:border-cream-900/30 rounded-2xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cream-400 to-cream-300 flex items-center justify-center font-bold text-white">
                            {userInfo.nickname?.[0] || userInfo.email[0].toUpperCase()}
                        </div>
                        <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                                {userInfo.nickname || '未设置昵称'}
                            </div>
                            <div className="text-sm text-gray-500">{userInfo.email}</div>
                        </div>
                    </div>
                    <button
                        onClick={onClearUserFilter}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                        <X className="w-4 h-4" />
                        清除筛选
                    </button>
                </div>
            )}

            {/* 统计卡片 */}
            {userId && stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-cream-100 dark:bg-cream-900/30 flex items-center justify-center">
                                <MessageSquare className="w-5 h-5 text-cream-600 dark:text-cream-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_conversations}</div>
                                <div className="text-xs text-gray-500">总对话数</div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_messages}</div>
                                <div className="text-xs text-gray-500">总消息数</div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <div className="text-lg font-bold text-gray-900 dark:text-white">
                                    {Object.keys(stats.model_breakdown).length}
                                </div>
                                <div className="text-xs text-gray-500">使用模型</div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-gray-900 dark:text-white">
                                    {stats.most_active_day || '-'}
                                </div>
                                <div className="text-xs text-gray-500">最活跃日期</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 工具栏 */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* 搜索框 */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="搜索对话标题或用户邮箱..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(getInputValue(e));
                            setPage(1);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-2 focus:ring-brand-500 outline-none transition text-sm"
                    />
                </div>

                {/* 筛选按钮 */}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition ${showFilters || hasActiveFilters ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                >
                    <Filter className="w-4 h-4" />
                    <span>筛选</span>
                    {hasActiveFilters && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full" />}
                </button>

                {/* 视图切换 */}
                {userId && (
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                        >
                            <List className="w-4 h-4 inline mr-1" />
                            列表
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${viewMode === 'timeline' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                        >
                            <CalendarDays className="w-4 h-4 inline mr-1" />
                            时间线
                        </button>
                    </div>
                )}
            </div>

            {/* 高级筛选面板 */}
            {showFilters && (
                <FiltersPanel
                    filters={filters}
                    updateFilter={updateFilter}
                    clearFilters={clearFilters}
                    onClose={() => setShowFilters(false)}
                    searchQuery={searchQuery}
                />
            )}

            {/* 对话列表 */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {/* 列表视图 */}
                {viewMode === 'list' && (
                    <>
                        {loading ? (
                            <div className="p-12 text-center text-gray-400">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto text-cream-500" />
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                没有找到符合条件的对话
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                {conversations.map(c => (
                                    <div
                                        key={c.id}
                                        className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition cursor-pointer"
                                        onClick={() => handleViewDetail(c.id)}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <h4 className="font-medium text-gray-900 dark:text-white truncate">
                                                        {c.title || '新对话'}
                                                    </h4>
                                                    <UserTypeBadge type={c.user_type} />
                                                    {c.model_name && (
                                                        <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded">
                                                            {c.model_name}
                                                        </span>
                                                    )}
                                                    {c.uses_custom_endpoint && (
                                                        <span className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded" title={c.custom_endpoint}>
                                                            <Globe className="w-3 h-3" />
                                                            自定义接口
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                                    <span className="flex items-center gap-1">
                                                        <User className="w-3 h-3" />
                                                        {c.user_email?.split('@')[0]}
                                                    </span>
                                                    {c.user_type === 'visitor' && c.visitor_id && (
                                                        <span className="text-xs text-gray-400">
                                                            访客 ID: {c.visitor_id.slice(0, 8)}...
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <MessageSquare className="w-3 h-3" />
                                                        {c.message_count} 条消息
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDate(c.updated_at)}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteConversation(c.id); }}
                                                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-lg transition"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 分页信息 */}
                        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 flex items-center justify-between">
                            <span>
                                显示 {conversations.length} 条 / 共 {total} 条对话
                            </span>
                            {total > pageSize && (
                                <span>
                                    第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页
                                </span>
                            )}
                        </div>

                        {/* 分页 */}
                        <Pagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPageChange={(p) => setPage(p)}
                            itemLabel="条对话"
                        />
                    </>
                )}

                {/* 时间线视图 */}
                {viewMode === 'timeline' && userId && (
                    <>
                        {timelineLoading ? (
                            <div className="p-12 text-center text-gray-400">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto text-cream-500" />
                            </div>
                        ) : timeline.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                该用户暂无对话记录
                            </div>
                        ) : (
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
                                            {day.conversations.map(conv => (
                                                <div
                                                    key={conv.id}
                                                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                                                    onClick={() => handleViewDetail(conv.id)}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2 mb-1">
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
                                                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                                                <span className="flex items-center gap-1">
                                                                    <MessageSquare className="w-3 h-3" />
                                                                    {conv.message_count} 条消息
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Clock className="w-3 h-3" />
                                                                    {formatTime(conv.created_at)}
                                                                </span>
                                                                {conv.user_type === 'visitor' && conv.visitor_id && (
                                                                    <span className="text-[11px] text-gray-500">
                                                                        访客 ID: {conv.visitor_id.slice(0, 8)}...
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                                                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded transition flex-shrink-0"
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
                        )}

                        {/* 分页信息 */}
                        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 flex items-center justify-between">
                            <span>
                                显示 {timeline.length} 天 / 共 {timelineTotal} 天
                            </span>
                            {timelineTotal > pageSize && (
                                <span>
                                    第 {page} 页 / 共 {Math.ceil(timelineTotal / pageSize)} 页
                                </span>
                            )}
                        </div>

                        {/* 分页 */}
                        <Pagination
                            page={page}
                            pageSize={pageSize}
                            total={timelineTotal}
                            onPageChange={(p) => setPage(p)}
                            itemLabel="天"
                        />
                    </>
                )}
            </div>

            {/* 对话详情弹窗 */}
            {showDetailModal && (selectedConversation || loadingDetail) && (
                <ConversationDetailModal
                    conversation={selectedConversation || ({} as AdminConversationDetail)}
                    loading={loadingDetail}
                    onClose={handleCloseModal}
                />
            )}
        </div>
    );
};
