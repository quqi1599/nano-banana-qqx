/**
 * 游客（未登录用户）管理面板
 * 查看、筛选、删除游客记录
 */
import { useState, useEffect, useCallback } from 'react';
import {
    Users, Search, Filter, X, Trash2, MessageSquare,
    Image as ImageIcon, Globe, Clock,
    ChevronRight
} from 'lucide-react';
import {
    getVisitors,
    getVisitorStats,
    getVisitorDetail,
    deleteVisitor,
    type VisitorInfo,
    type VisitorFilters,
    type VisitorStats
} from '../../services/adminService';
import { ErrorAlert, LoadingState, Pagination, InlineLoading } from '../common';
import { formatDate, formatShortDate } from '../../../utils/formatters';

export function VisitorsPanel() {
    // 状态管理
    const [visitors, setVisitors] = useState<VisitorInfo[]>([]);
    const [stats, setStats] = useState<VisitorStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(false);
    const [error, setError] = useState('');

    // 分页
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [total, setTotal] = useState(0);

    // 筛选
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<VisitorFilters>({});

    // 展开详情
    const [expandedVisitorId, setExpandedVisitorId] = useState<string | null>(null);
    const [visitorDetails, setVisitorDetails] = useState<Record<string, any>>({});
    const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // 加载游客列表
    const loadVisitors = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const searchParams: VisitorFilters = { ...filters };
            if (searchQuery) searchParams.search = searchQuery;

            const result = await getVisitors(page, searchParams);
            setVisitors(result.visitors);
            setTotal(result.total);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [page, filters, searchQuery]);

    // 加载统计数据
    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const result = await getVisitorStats();
            setStats(result);
        } catch (err) {
            console.error('加载统计失败:', err);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => { loadVisitors(); }, [loadVisitors]);
    useEffect(() => { loadStats(); }, [loadStats]);

    // 更新筛选
    const updateFilter = (key: keyof VisitorFilters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const clearFilters = () => {
        setFilters({});
        setSearchQuery('');
        setPage(1);
    };

    const hasActiveFilters = Object.keys(filters).some(k =>
        filters[k as keyof VisitorFilters] !== undefined
    ) || searchQuery.length > 0;

    // 展开/收起游客详情
    const toggleVisitorDetail = async (visitor: VisitorInfo) => {
        if (expandedVisitorId === visitor.id) {
            setExpandedVisitorId(null);
            return;
        }

        setExpandedVisitorId(visitor.id);

        if (!visitorDetails[visitor.id]) {
            setLoadingDetails(prev => ({ ...prev, [visitor.id]: true }));
            try {
                const detail = await getVisitorDetail(visitor.visitor_id);
                setVisitorDetails(prev => ({ ...prev, [visitor.id]: detail }));
            } catch (err) {
                console.error('加载详情失败:', err);
            } finally {
                setLoadingDetails(prev => ({ ...prev, [visitor.id]: false }));
            }
        }
    };

    // 删除游客
    const handleDeleteVisitor = async (visitorId: string) => {
        if (!confirm('确定要删除此游客记录吗？这将同时删除该游客的所有对话历史。')) return;

        try {
            await deleteVisitor(visitorId);
            showToast('删除成功', 'success');
            loadVisitors();
            loadStats();
        } catch (err) {
            showToast((err as Error).message, 'error');
        }
    };

    // 提取端点显示名称
    const getEndpointLabel = (endpoint: string | null) => {
        if (!endpoint) return '默认端点';
        try {
            const url = new URL(endpoint);
            return url.hostname;
        } catch {
            return endpoint;
        }
    };

    return (
        <div className="space-y-4">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-20 right-4 z-50 px-6 py-3 rounded-xl shadow-lg ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white font-medium animate-in fade-in slide-in-from-right-4`}>
                    {toast.message}
                </div>
            )}

            {/* 错误提示 */}
            <ErrorAlert message={error} onDismiss={() => setError('')} />

            {/* 统计卡片 */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_visitors}</div>
                                <div className="text-xs text-gray-500">游客总数</div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_conversations}</div>
                                <div className="text-xs text-gray-500">总对话数</div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_images}</div>
                                <div className="text-xs text-gray-500">生成图片</div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-cream-100 dark:bg-cream-900/30 flex items-center justify-center">
                                <Globe className="w-5 h-5 text-cream-600 dark:text-cream-400" />
                            </div>
                            <div>
                                <div className="text-lg font-bold text-gray-900 dark:text-white">
                                    {stats.top_endpoints.length}
                                </div>
                                <div className="text-xs text-gray-500">API端点</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 热门端点 */}
            {stats && stats.top_endpoints.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">常用 API 端点</h3>
                    <div className="flex flex-wrap gap-2">
                        {stats.top_endpoints.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg text-sm">
                                <Globe className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-gray-700 dark:text-gray-300 font-medium">
                                    {getEndpointLabel(item.endpoint)}
                                </span>
                                <span className="text-xs text-gray-400">({item.count})</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 工具栏 */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="搜索 visitor_id 或 API 端点..."
                        value={searchQuery}
                        onInput={(e) => { setSearchQuery((e.target as HTMLInputElement).value); setPage(1); }}
                        className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-2 focus:ring-brand-500 outline-none transition text-sm"
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl font-medium transition ${showFilters || hasActiveFilters
                            ? 'bg-brand-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                >
                    <Filter className="w-4 h-4" />
                    <span className="hidden sm:inline">筛选</span>
                    {hasActiveFilters && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full" />}
                </button>
            </div>

            {/* 高级筛选面板 */}
            {showFilters && (
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-700 dark:text-gray-300">高级筛选</h3>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"
                            >
                                <X className="w-3 h-3" />
                                清空筛选
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <input
                            type="text"
                            placeholder="API 端点"
                            value={filters.endpoint ?? ''}
                            onChange={(e) => updateFilter('endpoint', (e.target as HTMLInputElement).value || undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <input
                            type="number"
                            placeholder="最少对话数"
                            value={filters.min_conversations ?? ''}
                            onChange={(e) => updateFilter('min_conversations', (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <input
                            type="number"
                            placeholder="最少消息数"
                            value={filters.min_messages ?? ''}
                            onChange={(e) => updateFilter('min_messages', (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">首次访问起</label>
                            <input
                                type="date"
                                value={filters.first_seen_after ?? ''}
                                onChange={(e) => updateFilter('first_seen_after', (e.target as HTMLInputElement).value || undefined)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">首次访问止</label>
                            <input
                                type="date"
                                value={filters.first_seen_before ?? ''}
                                onChange={(e) => updateFilter('first_seen_before', (e.target as HTMLInputElement).value || undefined)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* 游客列表 */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {loading ? (
                    <LoadingState />
                ) : visitors.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        没有找到符合条件的游客
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {visitors.map(visitor => (
                            <div key={visitor.id} className="divide-y divide-gray-100 dark:divide-gray-800">
                                {/* 主行 */}
                                <div
                                    className="p-3 sm:px-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition cursor-pointer flex items-center justify-between"
                                    onClick={() => toggleVisitorDetail(visitor)}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center">
                                            <Globe className="w-4 h-4 text-white" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                                                    {visitor.visitor_id.slice(0, 8)}...
                                                </span>
                                                {visitor.custom_endpoint && (
                                                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded truncate max-w-[150px]" title={visitor.custom_endpoint}>
                                                        {getEndpointLabel(visitor.custom_endpoint)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                                                <span className="flex items-center gap-1">
                                                    <MessageSquare className="w-3 h-3" />
                                                    {visitor.conversation_count}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <ImageIcon className="w-3 h-3" />
                                                    {visitor.image_count}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatShortDate(visitor.last_seen)}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedVisitorId === visitor.id ? 'rotate-90' : ''}`} />
                                    </div>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteVisitor(visitor.visitor_id);
                                        }}
                                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-lg transition"
                                        title="删除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* 展开的详情 */}
                                {expandedVisitorId === visitor.id && (
                                    <div className="px-3 sm:px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
                                        {loadingDetails[visitor.id] ? (
                                            <InlineLoading className="py-4" />
                                        ) : visitorDetails[visitor.id] ? (
                                            <div className="space-y-3">
                                                {/* 统计数据 */}
                                                <div className="grid grid-cols-3 gap-2 text-center">
                                                    <div className="p-2 bg-white dark:bg-gray-900 rounded-lg">
                                                        <div className="text-lg font-bold text-gray-900 dark:text-white">{visitor.conversation_count}</div>
                                                        <div className="text-xs text-gray-500">对话</div>
                                                    </div>
                                                    <div className="p-2 bg-white dark:bg-gray-900 rounded-lg">
                                                        <div className="text-lg font-bold text-gray-900 dark:text-white">{visitor.message_count}</div>
                                                        <div className="text-xs text-gray-500">消息</div>
                                                    </div>
                                                    <div className="p-2 bg-white dark:bg-gray-900 rounded-lg">
                                                        <div className="text-lg font-bold text-gray-900 dark:text-white">{visitor.image_count}</div>
                                                        <div className="text-xs text-gray-500">图片</div>
                                                    </div>
                                                </div>

                                                {/* 时间信息 */}
                                                <div className="text-xs text-gray-500">
                                                    首次访问: {formatDate(visitor.first_seen)} · 最后活跃: {formatDate(visitor.last_seen)}
                                                </div>

                                                {/* 最近对话 */}
                                                {visitorDetails[visitor.id]?.conversations && visitorDetails[visitor.id].conversations.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">最近对话</h4>
                                                        <div className="space-y-1">
                                                            {visitorDetails[visitor.id].conversations.slice(0, 3).map((conv: any) => (
                                                                <div key={conv.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded-lg text-xs">
                                                                    <span className="truncate flex-1 text-gray-700 dark:text-gray-300">
                                                                        {conv.title || '新对话'}
                                                                    </span>
                                                                    <span className="text-gray-400 ml-2">
                                                                        {conv.message_count} 条消息
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-4 text-gray-400 text-xs">
                                                暂无详细数据
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* 分页 */}
                <Pagination
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setPage}
                    itemLabel="个游客"
                />
            </div>
        </div>
    );
}
