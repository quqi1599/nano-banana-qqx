/**
 * 增强版用户管理面板
 * 功能：高级筛选、批量操作、标签管理、实时搜索、移动端适配
 */
import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Filter, X, CheckSquare, Square, Ban, Unlock, CreditCard, Tag, Download, ChevronDown } from 'lucide-react';
import {
    getUsersAdvanced,
    exportUsers,
    batchUpdateUserStatus,
    batchAdjustCredits,
    requestAdminActionConfirmation,
    updateUserTags,
    getUserTags,
    type AdminUser,
    type UserFilters,
    type UserTagsResponse,
} from '../services/adminService';

// 防抖 Hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

interface UserManagementPanelProps {
    apiBase?: string;
}

export function UserManagementPanel({ apiBase }: UserManagementPanelProps) {
    // ===== 状态管理 =====
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);

    // 搜索
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    // 高级筛选
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<UserFilters>({});

    // 批量选择
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectAll, setSelectAll] = useState(false);

    // 批量操作模态框
    const [batchAction, setBatchAction] = useState<'disable' | 'enable' | 'credits' | null>(null);
    const [batchReason, setBatchReason] = useState('');
    const [batchAmount, setBatchAmount] = useState(0);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [batchLoading, setBatchLoading] = useState(false);

    // 用户标签
    const [allTags, setAllTags] = useState<UserTagsResponse | null>(null);
    const [editingTagsUserId, setEditingTagsUserId] = useState<string | null>(null);
    const [userTagsInput, setUserTagsInput] = useState('');
    const [newTagInput, setNewTagInput] = useState('');
    const [filterTags, setFilterTags] = useState<string[]>([]);

    // Toast 消息
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // ===== 数据加载 =====
    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const searchParams = { ...filters };
            if (debouncedSearch) searchParams.search = debouncedSearch;
            if (filterTags.length > 0) {
                // 标签筛选：暂时用搜索字段实现
                const tagSearch = filterTags.map(t => `#${t}`).join(' ');
                searchParams.search = searchParams.search
                    ? `${searchParams.search} ${tagSearch}`
                    : tagSearch;
            }

            const result = await getUsersAdvanced(page, searchParams);
            setUsers(result.users);
            setTotal(result.total);
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filters, debouncedSearch, filterTags]);

    const loadTags = useCallback(async () => {
        try {
            const result = await getUserTags();
            setAllTags(result);
        } catch (error) {
            console.error('加载标签失败:', error);
        }
    }, []);

    useEffect(() => { loadUsers(); }, [loadUsers]);
    useEffect(() => { loadTags(); }, [loadTags]);

    // ===== 搜索和筛选 =====
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setPage(1);
    };

    const updateFilter = (key: keyof UserFilters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const clearFilters = () => {
        setFilters({});
        setFilterTags([]);
        setSearchQuery('');
        setPage(1);
    };

    const hasActiveFilters = Object.keys(filters).some(k =>
        k !== 'search' && filters[k as keyof UserFilters] !== undefined
    ) || filterTags.length > 0;

    // ===== 批量操作 =====
    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
        setSelectAll(false);
    };

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(users.map(u => u.id)));
        }
        setSelectAll(!selectAll);
    };

    const handleBatchAction = async () => {
        if (selectedIds.size === 0) return;

        if (batchAction === 'credits' && batchAmount === 0) {
            showToast('请输入调整金额', 'error');
            return;
        }

        if (!batchReason.trim()) {
            showToast('请填写操作原因', 'error');
            return;
        }

        setBatchLoading(true);
        try {
            // 1. 获取确认令牌
            const confirmResult = await requestAdminActionConfirmation(
                batchAction === 'credits' ? 'batch_credits' : 'batch_status',
                confirmPassword
            );

            // 2. 执行批量操作
            const userIds = Array.from(selectedIds);
            if (batchAction === 'disable' || batchAction === 'enable') {
                await batchUpdateUserStatus(userIds, batchAction === 'enable', batchReason, confirmResult.confirm_token);
                showToast(`已${batchAction === 'disable' ? '禁用' : '启用'} ${selectedIds.size} 个用户`, 'success');
            } else if (batchAction === 'credits') {
                await batchAdjustCredits(userIds, batchAmount, batchReason, confirmResult.confirm_token);
                showToast(`已调整 ${selectedIds.size} 个用户的积分`, 'success');
            }

            // 3. 重置状态
            setSelectedIds(new Set());
            setSelectAll(false);
            setBatchAction(null);
            setBatchReason('');
            setBatchAmount(0);
            setConfirmPassword('');
            loadUsers();
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setBatchLoading(false);
        }
    };

    // ===== 标签管理 =====
    const openTagsEditor = (user: AdminUser) => {
        setEditingTagsUserId(user.id);
        setUserTagsInput(user.tags.join(', '));
    };

    const saveUserTags = async (userId: string) => {
        const tags = userTagsInput
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0 && t.length <= 20);

        try {
            await updateUserTags(userId, tags);
            showToast('标签更新成功', 'success');
            setEditingTagsUserId(null);

            // 更新本地用户数据
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, tags } : u
            ));
            loadTags();
        } catch (error) {
            showToast((error as Error).message, 'error');
        }
    };

    const addNewTag = (userId: string) => {
        if (!newTagInput.trim()) return;
        const currentTags = userTagsInput.split(',').map(t => t.trim()).filter(t => t);
        if (!currentTags.includes(newTagInput.trim())) {
            setUserTagsInput([...currentTags, newTagInput.trim()].join(', '));
            setNewTagInput('');
        }
    };

    const toggleTagFilter = (tag: string) => {
        setFilterTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
        setPage(1);
    };

    // ===== 导出 =====
    const handleExport = async () => {
        try {
            const searchParams = { ...filters };
            if (debouncedSearch) searchParams.search = debouncedSearch;
            await exportUsers(searchParams);
            showToast('导出成功', 'success');
        } catch (error) {
            showToast((error as Error).message, 'error');
        }
    };

    // ===== 工具函数 =====
    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    // ===== 渲染 =====
    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg ${
                    toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                } text-white font-medium animate-in fade-in slide-in-from-right-4`}>
                    {toast.message}
                </div>
            )}

            {/* 搜索栏 */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onInput={(e) => handleSearchChange((e.target as HTMLInputElement).value)}
                        placeholder="搜索邮箱、昵称..."
                        className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-2 focus:ring-amber-500 outline-none transition text-sm"
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl font-medium transition ${
                        showFilters || hasActiveFilters
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                >
                    <Filter className="w-4 h-4" />
                    <span className="hidden sm:inline">筛选</span>
                    {hasActiveFilters && (
                        <span className="ml-1 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                </button>
                <button
                    onClick={handleExport}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">导出</span>
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
                                className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1"
                            >
                                <X className="w-3 h-3" />
                                清空筛选
                            </button>
                        )}
                    </div>

                    {/* 筛选项网格 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {/* 用户状态 */}
                        <select
                            value={filters.is_active ?? ''}
                            onChange={(e) => updateFilter('is_active', (e.target as HTMLSelectElement).value === '' ? undefined : (e.target as HTMLSelectElement).value === 'true')}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        >
                            <option value="">全部状态</option>
                            <option value="true">正常</option>
                            <option value="false">已禁用</option>
                        </select>

                        {/* 角色筛选 */}
                        <select
                            value={filters.is_admin ?? ''}
                            onChange={(e) => updateFilter('is_admin', (e.target as HTMLSelectElement).value === '' ? undefined : (e.target as HTMLSelectElement).value === 'true')}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        >
                            <option value="">全部用户</option>
                            <option value="true">管理员</option>
                            <option value="false">普通用户</option>
                        </select>

                        {/* 余额范围 */}
                        <input
                            type="number"
                            placeholder="最小余额"
                            value={filters.min_balance ?? ''}
                            onInput={(e) => updateFilter('min_balance', (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <input
                            type="number"
                            placeholder="最大余额"
                            value={filters.max_balance ?? ''}
                            onInput={(e) => updateFilter('max_balance', (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : undefined)}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        />
                    </div>

                    {/* 日期筛选 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">注册日期起</label>
                            <input
                                type="date"
                                value={filters.created_after ?? ''}
                                onInput={(e) => updateFilter('created_after', (e.target as HTMLInputElement).value || undefined)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">注册日期止</label>
                            <input
                                type="date"
                                value={filters.created_before ?? ''}
                                onInput={(e) => updateFilter('created_before', (e.target as HTMLInputElement).value || undefined)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                            />
                        </div>
                    </div>

                    {/* 标签筛选 */}
                    {allTags && allTags.tags.length > 0 && (
                        <div>
                            <label className="text-xs text-gray-500 mb-2 block">按标签筛选</label>
                            <div className="flex flex-wrap gap-2">
                                {allTags.tags.slice(0, 10).map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => toggleTagFilter(tag)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                                            filterTags.includes(tag)
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        #{tag} ({allTags.counts[tag]})
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 批量操作栏 */}
            {selectedIds.size > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <span className="font-medium text-amber-800 dark:text-amber-400">
                            已选择 {selectedIds.size} 个用户
                        </span>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1"
                        >
                            <X className="w-3 h-3" />
                            取消选择
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setBatchAction('enable')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition"
                        >
                            <Unlock className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">启用</span>
                        </button>
                        <button
                            onClick={() => setBatchAction('disable')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition"
                        >
                            <Ban className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">禁用</span>
                        </button>
                        <button
                            onClick={() => setBatchAction('credits')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition"
                        >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">调积分</span>
                        </button>
                    </div>
                </div>
            )}

            {/* 用户列表 */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {/* 表头 */}
                <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <div className="col-span-1 flex items-center">
                        <button onClick={toggleSelectAll} className="text-gray-400 hover:text-amber-500">
                            {selectAll ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="col-span-4">用户</div>
                    <div className="col-span-2">状态</div>
                    <div className="col-span-2">余额</div>
                    <div className="col-span-2">标签</div>
                    <div className="col-span-1">操作</div>
                </div>

                {/* 用户列表 */}
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {loading ? (
                        <div className="p-8 text-center text-gray-400">加载中...</div>
                    ) : users.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            没有找到符合条件的用户
                        </div>
                    ) : (
                        users.map(user => (
                            <div
                                key={user.id}
                                className={`p-3 sm:px-4 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${
                                    !user.is_active ? 'opacity-60' : ''
                                }`}
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center">
                                    {/* 选择框 */}
                                    <div className="hidden sm:flex col-span-1">
                                        <button
                                            onClick={() => toggleSelect(user.id)}
                                            className="text-gray-400 hover:text-amber-500"
                                        >
                                            {selectedIds.has(user.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    {/* 移动端选择框 */}
                                    <div className="flex sm:hidden">
                                        <button
                                            onClick={() => toggleSelect(user.id)}
                                            className="text-gray-400 hover:text-amber-500"
                                        >
                                            {selectedIds.has(user.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    {/* 用户信息 */}
                                    <div className="col-span-1 sm:col-span-4 flex items-center gap-3">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-400 to-yellow-400 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                                            {user.nickname?.[0] || user.email[0].toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-gray-900 dark:text-white truncate">
                                                    {user.nickname || '未设置昵称'}
                                                </span>
                                                {user.is_admin && (
                                                    <span className="text-xs bg-amber-600 text-white px-1.5 py-0.5 rounded font-medium">管理</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-400 truncate">{user.email}</div>
                                        </div>
                                    </div>

                                    {/* 状态 */}
                                    <div className="col-span-1 sm:col-span-2">
                                        <div className="text-xs text-gray-400 sm:hidden">状态</div>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                            user.is_active
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        }`}>
                                            {user.is_active ? '正常' : '已禁用'}
                                        </span>
                                    </div>

                                    {/* 余额 */}
                                    <div className="col-span-1 sm:col-span-2">
                                        <div className="text-xs text-gray-400 sm:hidden">余额</div>
                                        <span className="font-mono font-bold text-amber-600">{user.credit_balance}</span>
                                    </div>

                                    {/* 标签 */}
                                    <div className="col-span-1 sm:col-span-2">
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {user.tags && user.tags.length > 0 ? (
                                                <>
                                                    {user.tags.slice(0, 2).map(tag => (
                                                        <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                    {user.tags.length > 2 && (
                                                        <span className="text-xs text-gray-400">+{user.tags.length - 2}</span>
                                                    )}
                                                    <button
                                                        onClick={() => openTagsEditor(user)}
                                                        className="text-gray-400 hover:text-amber-500"
                                                    >
                                                        <Tag className="w-3 h-3" />
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => openTagsEditor(user)}
                                                    className="text-gray-400 hover:text-amber-500"
                                                    title="添加标签"
                                                >
                                                    <Tag className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* 标签编辑器 */}
                                    {editingTagsUserId === user.id && (
                                        <div className="col-span-1 sm:col-span-11 mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <input
                                                    type="text"
                                                    value={userTagsInput}
                                                    onInput={(e) => setUserTagsInput((e.target as HTMLInputElement).value)}
                                                    placeholder="输入标签，用逗号分隔..."
                                                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-900 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                                                />
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newTagInput}
                                                        onInput={(e) => setNewTagInput((e.target as HTMLInputElement).value)}
                                                        onKeyDown={(e) => (e as KeyboardEvent).key === 'Enter' && addNewTag(user.id)}
                                                        placeholder="新标签"
                                                        className="w-24 px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-900 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                                                    />
                                                    <button
                                                        onClick={() => saveUserTags(user.id)}
                                                        className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition"
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingTagsUserId(null)}
                                                        className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-700 transition"
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            </div>
                                            {allTags && allTags.tags.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    <span className="text-xs text-gray-400">常用:</span>
                                                    {allTags.tags.slice(0, 6).map(tag => (
                                                        <button
                                                            key={tag}
                                                            onClick={() => {
                                                                const current = userTagsInput.split(',').map(t => t.trim()).filter(t => t);
                                                                if (!current.includes(tag)) {
                                                                    setUserTagsInput([...current, tag].join(', '));
                                                                }
                                                            }}
                                                            className="text-xs bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
                                                        >
                                                            +{tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* 分页 */}
                {total > pageSize && (
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                            共 {total} 个用户，第 {page} / {Math.ceil(total / pageSize)} 页
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
            </div>

            {/* 批量操作确认模态框 */}
            {batchAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                                {batchAction === 'disable' && '批量禁用用户'}
                                {batchAction === 'enable' && '批量启用用户'}
                                {batchAction === 'credits' && '批量调整积分'}
                            </h3>

                            <div className="space-y-4">
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                    将对 <span className="font-bold text-amber-600">{selectedIds.size}</span> 个用户执行此操作
                                </div>

                                {batchAction === 'credits' && (
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                            调整金额
                                        </label>
                                        <input
                                            type="number"
                                            value={batchAmount}
                                            onInput={(e) => setBatchAmount(Number((e.target as HTMLInputElement).value))}
                                            placeholder="正数增加，负数减少"
                                            className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                        操作原因 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={batchReason}
                                        onInput={(e) => setBatchReason((e.target as HTMLInputElement).value)}
                                        placeholder="请输入操作原因..."
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                        管理员密码确认 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                                        placeholder="请输入管理员密码..."
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setBatchAction(null)}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleBatchAction}
                                    disabled={batchLoading}
                                    className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 transition"
                                >
                                    {batchLoading ? '处理中...' : '确认执行'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
