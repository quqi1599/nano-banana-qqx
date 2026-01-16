import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, MessageSquare, Trash2, X, Loader2, User, Bot, Clock,
    Filter, Calendar, Hash, List, CalendarDays, ChevronDown,
    BarChart3, MessageCircle
} from 'lucide-react';
import {
    adminGetConversationsFiltered,
    adminGetConversation,
    adminDeleteConversation,
    adminGetUserConversationStats,
    adminGetUserConversationTimeline,
    AdminConversation,
    AdminConversationDetail,
    ConversationFilters,
    UserConversationStats,
    ConversationTimelineItem,
} from '../../../services/conversationService';

// 类型安全的输入值获取函数
const getInputValue = (e: Event): string => (e.target as HTMLInputElement).value;

interface AdminConversationsProps {
    userId?: string | null;
    userInfo?: { email: string; nickname?: string | null } | null;
    onClearUserFilter?: () => void;
}

type ViewMode = 'list' | 'timeline';

export const AdminConversations = ({ userId, userInfo, onClearUserFilter }: AdminConversationsProps) => {
    // 状态管理
    const [conversations, setConversations] = useState<AdminConversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<AdminConversationDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState('');

    // 分页
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [total, setTotal] = useState(0);

    // 视图模式
    const [viewMode, setViewMode] = useState<ViewMode>('list');

    // 筛选状态
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<ConversationFilters>({ user_id: userId || undefined });

    // 时间线状态
    const [timeline, setTimeline] = useState<ConversationTimelineItem[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [timelineTotal, setTimelineTotal] = useState(0);

    // 统计数据
    const [stats, setStats] = useState<UserConversationStats | null>(null);

    // 当 userId prop 变化时更新筛选
    useEffect(() => {
        setFilters(prev => ({ ...prev, user_id: userId || undefined }));
        setPage(1);
    }, [userId]);

    // 加载对话列表
    const loadConversations = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const currentFilters = { ...filters };
            if (searchQuery) currentFilters.search = searchQuery;
            if (userId) currentFilters.user_id = userId;

            const result = await adminGetConversationsFiltered(currentFilters, page, pageSize);
            setConversations(result.conversations);
            setTotal(result.total);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [filters, searchQuery, page, pageSize, userId]);

    // 加载用户统计
    const loadStats = useCallback(async () => {
        if (!userId) return;
        try {
            const result = await adminGetUserConversationStats(userId);
            setStats(result);
        } catch (err) {
            console.error('加载统计失败:', err);
        }
    }, [userId]);

    // 加载时间线
    const loadTimeline = useCallback(async () => {
        if (!userId) return;
        setTimelineLoading(true);
        try {
            const result = await adminGetUserConversationTimeline(userId, page, pageSize);
            setTimeline(result.timeline);
            setTimelineTotal(result.total);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setTimelineLoading(false);
        }
    }, [userId, page, pageSize]);

    // 初始加载和依赖变化时重新加载
    useEffect(() => {
        if (viewMode === 'list') {
            loadConversations();
        } else {
            loadTimeline();
        }
    }, [viewMode, loadConversations, loadTimeline]);

    // 加载用户统计
    useEffect(() => {
        if (userId) {
            loadStats();
        } else {
            setStats(null);
        }
    }, [userId, loadStats]);

    // 加载对话详情
    const loadConversationDetail = async (id: string) => {
        setLoadingDetail(true);
        try {
            const data = await adminGetConversation(id);
            setSelectedConversation(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoadingDetail(false);
        }
    };

    // 删除对话
    const handleDeleteConversation = async (id: string, e?: React.MouseEvent<HTMLButtonElement>) => {
        if (e) e.stopPropagation();
        if (!confirm('确定要删除此对话吗？')) return;
        try {
            await adminDeleteConversation(id);
            if (selectedConversation?.id === id) {
                setSelectedConversation(null);
            }
            if (viewMode === 'list') {
                loadConversations();
            } else {
                loadTimeline();
            }
        } catch (err) {
            setError((err as Error).message);
        }
    };

    // 更新筛选条件
    const updateFilter = (key: keyof ConversationFilters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    };

    // 清除筛选
    const clearFilters = () => {
        setFilters({ user_id: userId || undefined });
        setSearchQuery('');
        setPage(1);
    };

    // 格式化日期
    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('zh-CN', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    // 检查是否有活跃筛选
    const hasActiveFilters = Object.keys(filters).some(k =>
        k !== 'user_id' && filters[k as keyof ConversationFilters] !== undefined
    ) || searchQuery.length > 0;

    return (
        <div className="space-y-4">
            {/* 错误提示 */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3">
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></span>
                    {error}
                </div>
            )}

            {/* 用户筛选信息条 */}
            {userId && userInfo && (
                <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-yellow-400 flex items-center justify-center font-bold text-white">
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
                            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />
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
                        onChange={(e) => { setSearchQuery(getInputValue(e)); setPage(1); }}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-2 focus:ring-amber-500 outline-none transition text-sm"
                    />
                </div>

                {/* 筛选按钮 */}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition ${
                        showFilters || hasActiveFilters
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
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
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                viewMode === 'list'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400'
                            }`}
                        >
                            <List className="w-4 h-4 inline mr-1" />
                            列表
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                viewMode === 'timeline'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400'
                            }`}
                        >
                            <CalendarDays className="w-4 h-4 inline mr-1" />
                            时间线
                        </button>
                    </div>
                )}
            </div>

            {/* 高级筛选面板 */}
            {showFilters && (
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-700 dark:text-gray-300">高级筛选</h3>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1"
                            >
                                <X className="w-3 h-3" />
                                清空筛选
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {/* 模型筛选 */}
                        <select
                            value={filters.model_name ?? ''}
                            onChange={(e) => updateFilter('model_name', getInputValue(e) || undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        >
                            <option value="">全部模型</option>
                            <option value="gemini-3-pro-image-preview">Gemini 3 Pro</option>
                            <option value="gemini-2.5-flash-image-preview">Gemini 2.5 Flash</option>
                            <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                        </select>

                        {/* 消息数量范围 */}
                        <input
                            type="number"
                            placeholder="最少消息数"
                            value={filters.min_messages ?? ''}
                            onChange={(e) => updateFilter('min_messages', getInputValue(e) ? Number(getInputValue(e)) : undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <input
                            type="number"
                            placeholder="最多消息数"
                            value={filters.max_messages ?? ''}
                            onChange={(e) => updateFilter('max_messages', getInputValue(e) ? Number(getInputValue(e)) : undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        />

                        {/* 时间范围 */}
                        <input
                            type="date"
                            value={filters.date_from ?? ''}
                            onChange={(e) => updateFilter('date_from', getInputValue(e) || undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        />
                    </div>
                </div>
            )}

            {/* 对话列表 */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {/* 列表视图 */}
                {viewMode === 'list' && (
                    <>
                        {loading ? (
                            <div className="p-8 text-center text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                加载中...
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
                                        onClick={() => loadConversationDetail(c.id)}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-medium text-gray-900 dark:text-white truncate">
                                                        {c.title || '新对话'}
                                                    </h4>
                                                    {c.model_name && (
                                                        <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded">
                                                            {c.model_name}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-gray-400">
                                                    <span className="flex items-center gap-1">
                                                        <User className="w-3 h-3" />
                                                        {c.user_email?.split('@')[0]}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Hash className="w-3 h-3" />
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

                        {/* 分页 */}
                        {total > pageSize && (
                            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <div className="text-sm text-gray-500">
                                    共 {total} 条对话，第 {page} / {Math.ceil(total / pageSize)} 页
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                    >
                                        上一页
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(Math.ceil(total / pageSize), p + 1))}
                                        disabled={page >= Math.ceil(total / pageSize)}
                                        className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                    >
                                        下一页
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* 时间线视图 */}
                {viewMode === 'timeline' && userId && (
                    <>
                        {timelineLoading ? (
                            <div className="p-8 text-center text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                加载中...
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
                                                <Calendar className="w-4 h-4 text-amber-500" />
                                                <span className="font-medium text-gray-900 dark:text-white">
                                                    {new Date(day.date).toLocaleDateString('zh-CN', {
                                                        year: 'numeric',
                                                        month: 'long',
                                                        day: 'numeric',
                                                        weekday: 'short'
                                                    })}
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
                                                    onClick={() => loadConversationDetail(conv.id)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                                    {conv.title || '新对话'}
                                                                </span>
                                                                {conv.model_name && (
                                                                    <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">
                                                                        {conv.model_name.split('-').slice(0, 2).join('-')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                                                <span>{conv.message_count} 条消息</span>
                                                                <span>{new Date(conv.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
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
                        )}

                        {/* 时间线分页 */}
                        {timelineTotal > pageSize && (
                            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <div className="text-sm text-gray-500">
                                    共 {timelineTotal} 天，第 {page} / {Math.ceil(timelineTotal / pageSize)} 页
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                    >
                                        上一页
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(Math.ceil(timelineTotal / pageSize), p + 1))}
                                        disabled={page >= Math.ceil(timelineTotal / pageSize)}
                                        className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                    >
                                        下一页
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 对话详情弹窗 */}
            {selectedConversation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
                        {/* 头部 */}
                        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1">
                                    {selectedConversation.title || '新对话'}
                                </h3>
                                <p className="text-xs text-gray-500">
                                    {selectedConversation.user_email} • {formatDate(selectedConversation.created_at)}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedConversation(null)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* 消息列表 */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {loadingDetail ? (
                                <div className="text-center p-4">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500" />
                                </div>
                            ) : (
                                selectedConversation.messages.map((msg, idx) => (
                                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                            msg.role === 'user' || msg.role === 'assistant'
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-gray-100 text-gray-600'
                                        }`}>
                                            {msg.role === 'user' || msg.role === 'assistant' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                        </div>
                                        <div className={`max-w-[80%] ${msg.role === 'user' || msg.role === 'assistant' ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
                                            <div className={`p-3 rounded-2xl ${
                                                msg.role === 'user' || msg.role === 'assistant'
                                                    ? 'bg-amber-500 text-white rounded-tr-none'
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-none'
                                            }`}>
                                                {msg.content && (
                                                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                                                )}
                                                {/* 思考过程标记 */}
                                                {msg.is_thought && (
                                                    <span className="inline-flex items-center gap-1 text-xs opacity-70 mt-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                                        思考过程 {msg.thinking_duration && `(${msg.thinking_duration.toFixed(1)}s)`}
                                                    </span>
                                                )}
                                            </div>
                                            {/* 图片渲染 */}
                                            {msg.images && msg.images.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {msg.images.map((img, imgIdx) => (
                                                        <img
                                                            key={imgIdx}
                                                            src={`data:${img.mimeType};base64,${img.base64}`}
                                                            alt={`消息图片 ${imgIdx + 1}`}
                                                            className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition"
                                                            onClick={() => {
                                                                // 点击放大
                                                                const win = window.open();
                                                                if (win) {
                                                                    win.document.write(`<img src="data:${img.mimeType};base64,${img.base64}" style="max-width:100%;height:auto;" />`);
                                                                }
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
