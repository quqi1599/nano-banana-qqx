/**
 * 增强版用户管理面板
 * 功能：高级筛选、批量操作、标签管理、实时搜索、移动端适配、创建用户、修改密码
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Users, Search, Filter, X, CheckSquare, Square, Ban, Unlock, CreditCard, Tag, Download, ChevronDown, MessageSquare, List, Clock, Plus, Key, Eye, EyeOff, Edit3 } from 'lucide-react';
import {
    getUsersAdvanced,
    exportUsers,
    batchUpdateUserStatus,
    batchAdjustCredits,
    requestAdminActionConfirmation,
    adjustUserCredits,
    getUserCreditHistory,
    getUserUsageLogs,
    updateUserTags,
    getUserTags,
    createUser,
    changeUserPassword,
    adjustUserBalance,
    type AdminUser,
    type UserFilters,
    type UserTagsResponse,
    type CreditHistoryResult,
    type UsageLogResult,
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
    onViewConversations?: (userId: string, userEmail: string, userNickname?: string | null) => void;
    initialSearch?: string;  // 初始搜索关键词（从工单跳转过来时使用）
    onSearchChange?: (value: string) => void;  // 搜索变化时的回调（用于清除跳转状态）
}

export function UserManagementPanel({ apiBase, onViewConversations, initialSearch, onSearchChange }: UserManagementPanelProps) {
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

    // ===== 批量操作模态框 =====
    // 用于批量禁用/启用用户、批量调整积分时的二次确认
    const [batchAction, setBatchAction] = useState<'disable' | 'enable' | 'credits' | null>(null);
    const [batchReason, setBatchReason] = useState('');           // 操作原因（必填）
    const [batchAmount, setBatchAmount] = useState(0);             // 积分调整金额
    const [batchConfirmPassword, setBatchConfirmPassword] = useState('');  // 管理员密码确认（与修改密码的 confirmPassword 区分）
    const [batchLoading, setBatchLoading] = useState(false);

    // 单用户积分管理
    const [activeUser, setActiveUser] = useState<AdminUser | null>(null);
    const [creditAdjustAmount, setCreditAdjustAmount] = useState(0);
    const [creditAdjustReason, setCreditAdjustReason] = useState('');
    const [creditAdjustLoading, setCreditAdjustLoading] = useState(false);
    const [creditHistory, setCreditHistory] = useState<CreditHistoryResult | null>(null);
    const [creditHistoryPage, setCreditHistoryPage] = useState(1);
    const [creditHistoryLoading, setCreditHistoryLoading] = useState(false);
    const [usageLogs, setUsageLogs] = useState<UsageLogResult | null>(null);
    const [usagePage, setUsagePage] = useState(1);
    const [usageLoading, setUsageLoading] = useState(false);
    const creditHistoryPageSize = 8;
    const usagePageSize = 8;

    // 用户标签
    const [allTags, setAllTags] = useState<UserTagsResponse | null>(null);
    const [editingTagsUserId, setEditingTagsUserId] = useState<string | null>(null);
    const [userTagsInput, setUserTagsInput] = useState('');
    const [newTagInput, setNewTagInput] = useState('');
    const [filterTags, setFilterTags] = useState<string[]>([]);

    // Toast 消息
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // 创建用户模态框
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserNickname, setNewUserNickname] = useState('');
    const [newUserCredit, setNewUserCredit] = useState(0);
    const [newUserPro3, setNewUserPro3] = useState(0);
    const [newUserFlash, setNewUserFlash] = useState(0);
    const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
    const [newUserNote, setNewUserNote] = useState('');
    const [newUserTags, setNewUserTags] = useState('');
    const [creatingUser, setCreatingUser] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // 修改密码模态框
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordUserId, setPasswordUserId] = useState('');
    const [passwordUserEmail, setPasswordUserEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    // 积分类型选择
    const [creditType, setCreditType] = useState<'credit' | 'pro3' | 'flash'>('credit');

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

    // ===== 数据加载 =====
    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const searchParams: UserFilters = { ...filters };
            if (debouncedSearch) searchParams.search = debouncedSearch;
            if (filterTags.length > 0) searchParams.tags = filterTags;

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

    // 当从工单跳转过来时，设置搜索词
    useEffect(() => {
        if (initialSearch) {
            setSearchQuery(initialSearch);
        }
    }, [initialSearch]);

    // ===== 搜索和筛选 =====
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setPage(1);
        onSearchChange?.(value);  // 通知父组件搜索已变化
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

    const formatShortDate = (value?: string | null) => {
        if (!value) return '—';
        return new Date(value).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const creditTypeLabel = (type: string) => {
        const map: Record<string, string> = {
            recharge: '充值',
            consume: '消耗',
            redeem: '兑换',
            bonus: '赠送',
            refund: '退款',
        };
        return map[type] || type;
    };

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
                batchConfirmPassword
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
            setBatchConfirmPassword('');
            loadUsers();
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setBatchLoading(false);
        }
    };

    const openCreditsPanel = (user: AdminUser) => {
        setActiveUser(user);
        setCreditAdjustAmount(0);
        setCreditAdjustReason('');
        setCreditHistory(null);
        setUsageLogs(null);
        setCreditHistoryPage(1);
        setUsagePage(1);
    };

    const closeCreditsPanel = () => {
        setActiveUser(null);
        setCreditAdjustAmount(0);
        setCreditAdjustReason('');
        setCreditHistory(null);
        setUsageLogs(null);
    };

    const loadCreditHistory = useCallback(async () => {
        if (!activeUser) return;
        setCreditHistoryLoading(true);
        try {
            const result = await getUserCreditHistory(activeUser.id, {
                page: creditHistoryPage,
                pageSize: creditHistoryPageSize,
            });
            setCreditHistory(result);
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setCreditHistoryLoading(false);
        }
    }, [activeUser, creditHistoryPage, creditHistoryPageSize]);

    const loadUsageLogs = useCallback(async () => {
        if (!activeUser) return;
        setUsageLoading(true);
        try {
            const result = await getUserUsageLogs(activeUser.id, usagePage, usagePageSize);
            setUsageLogs(result);
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setUsageLoading(false);
        }
    }, [activeUser, usagePage, usagePageSize]);

    useEffect(() => {
        if (activeUser) loadCreditHistory();
    }, [activeUser, loadCreditHistory]);
    useEffect(() => {
        if (activeUser) loadUsageLogs();
    }, [activeUser, loadUsageLogs]);

    const handleAdjustCredits = async () => {
        if (!activeUser) return;
        if (creditAdjustAmount === 0) {
            showToast('请输入调整金额', 'error');
            return;
        }
        if (!creditAdjustReason.trim()) {
            showToast('请填写调整原因', 'error');
            return;
        }

        setCreditAdjustLoading(true);
        try {
            const targetUserId = activeUser.id;
            const result = await adjustUserCredits(targetUserId, creditAdjustAmount, creditAdjustReason.trim());
            const newBalance = result.new_balance;
            showToast('积分调整成功', 'success');
            setCreditAdjustAmount(0);
            setCreditAdjustReason('');
            setActiveUser(prev => prev ? { ...prev, credit_balance: newBalance } : prev);
            setUsers(prev => prev.map(user => (
                user.id === targetUserId ? { ...user, credit_balance: newBalance } : user
            )));
            loadUsers();
            loadCreditHistory();
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setCreditAdjustLoading(false);
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

    // ===== 创建用户 =====
    const openCreateUserModal = () => {
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserNickname('');
        setNewUserCredit(0);
        setNewUserPro3(0);
        setNewUserFlash(0);
        setNewUserIsAdmin(false);
        setNewUserNote('');
        setNewUserTags('');
        setShowCreateUserModal(true);
    };

    const handleCreateUser = async () => {
        if (!newUserEmail || !newUserEmail.includes('@')) {
            showToast('请输入有效的邮箱地址', 'error');
            return;
        }

        setCreatingUser(true);
        try {
            const tags = newUserTags.split(',').map(t => t.trim()).filter(t => t);
            await createUser({
                email: newUserEmail,
                password: newUserPassword,
                nickname: newUserNickname || undefined,
                credit_balance: newUserCredit,
                pro3_balance: newUserPro3,
                flash_balance: newUserFlash,
                is_admin: newUserIsAdmin,
                note: newUserNote || undefined,
                tags,
            });
            showToast('用户创建成功', 'success');
            setShowCreateUserModal(false);
            loadUsers();
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setCreatingUser(false);
        }
    };

    // ===== 修改密码 =====
    const openPasswordModal = (user: AdminUser) => {
        setPasswordUserId(user.id);
        setPasswordUserEmail(user.email);
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordModal(true);
    };

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            showToast('两次输入的密码不一致', 'error');
            return;
        }

        setChangingPassword(true);
        try {
            await changeUserPassword(passwordUserId, newPassword);
            showToast('密码修改成功', 'success');
            setShowPasswordModal(false);
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setChangingPassword(false);
        }
    };

    // ===== 更新积分调整处理函数以支持多种积分类型 =====
    const handleAdjustCreditsWithType = async () => {
        if (!activeUser) return;
        if (creditAdjustAmount === 0) {
            showToast('请输入调整金额', 'error');
            return;
        }
        if (!creditAdjustReason.trim()) {
            showToast('请填写调整原因', 'error');
            return;
        }

        setCreditAdjustLoading(true);
        try {
            const targetUserId = activeUser.id;
            const result = await adjustUserBalance({
                userId: targetUserId,
                amount: creditAdjustAmount,
                reason: creditAdjustReason.trim(),
                type: creditType,
            });
            const newBalance = result.new_balance;
            showToast('积分调整成功', 'success');
            setCreditAdjustAmount(0);
            setCreditAdjustReason('');
            setCreditType('credit');

            // Update local user data
            const updateKey = creditType === 'credit' ? 'credit_balance' :
                creditType === 'pro3' ? 'pro3_balance' : 'flash_balance';
            setActiveUser(prev => prev ? { ...prev, [updateKey]: newBalance } : prev);
            setUsers(prev => prev.map(user => (
                user.id === targetUserId ? { ...user, [updateKey]: newBalance } : user
            )));
            loadUsers();
            if (creditType === 'credit') {
                loadCreditHistory();
            }
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            setCreditAdjustLoading(false);
        }
    };

    // ===== 渲染 =====
    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
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
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl font-medium transition ${showFilters || hasActiveFilters
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
                <button
                    onClick={openCreateUserModal}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition shadow-lg shadow-amber-500/20"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">新建用户</span>
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
                            value={String(filters.is_active ?? '')}
                            onChange={(e) => updateFilter('is_active', (e.target as HTMLSelectElement).value === '' ? undefined : (e.target as HTMLSelectElement).value === 'true')}
                            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                        >
                            <option value="">全部状态</option>
                            <option value="true">正常</option>
                            <option value="false">已禁用</option>
                        </select>

                        {/* 角色筛选 */}
                        <select
                            value={String(filters.is_admin ?? '')}
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
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition ${filterTags.includes(tag)
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
                <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    <div className="col-span-1 flex items-center">
                        <button onClick={toggleSelectAll} className="hover:text-amber-500 transition-colors">
                            {selectAll ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="col-span-4">用户</div>
                    <div className="col-span-2">状态</div>
                    <div className="col-span-2">余额</div>
                    <div className="col-span-2">标签</div>
                    <div className="col-span-1 text-right">操作</div>
                </div>

                {/* 用户列表 */}
                <div className="space-y-2">
                    {loading ? (
                        <div className="p-8 text-center text-gray-400">加载中...</div>
                    ) : users.length === 0 ? (
                        <div className="p-12 text-center text-gray-400 bg-gray-50/50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            没有找到符合条件的用户
                        </div>
                    ) : (
                        users.map(user => (
                            <div
                                key={user.id}
                                className={`group relative p-3 sm:px-4 sm:py-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-amber-200 dark:hover:border-amber-900/50 transition-all duration-200 ${!user.is_active ? 'opacity-60 grayscale' : ''
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
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-amber-500/20 ring-2 ring-white dark:ring-gray-800">
                                            {user.nickname?.[0] || user.email[0].toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-gray-900 dark:text-white truncate">
                                                    {user.nickname || '未设置昵称'}
                                                </span>
                                                {user.is_admin && (
                                                    <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-md font-bold shadow-sm shadow-amber-500/20">ADMIN</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-400 truncate font-medium">{user.email}</div>
                                        </div>
                                    </div>

                                    {/* 状态 */}
                                    <div className="col-span-1 sm:col-span-2">
                                        <div className="text-xs text-gray-400 sm:hidden mb-1">状态</div>
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${user.is_active
                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                            : 'bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${user.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                            {user.is_active ? '正常' : '已禁用'}
                                        </span>
                                    </div>

                                    {/* 余额 */}
                                    <div className="col-span-1 sm:col-span-2">
                                        <div className="text-xs text-gray-400 sm:hidden mb-1">余额</div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                                <span className="text-gray-500 dark:text-gray-400">通用:</span>
                                                <span className="font-mono font-bold text-gray-700 dark:text-gray-200">{user.credit_balance}</span>
                                            </div>
                                            {(user.pro3_balance > 0 || user.flash_balance > 0) && (
                                                <div className="flex items-center gap-2 text-[10px] opacity-75">
                                                    <span className="text-purple-600 font-medium">P3:{user.pro3_balance}</span>
                                                    <span className="text-blue-600 font-medium">F:{user.flash_balance}</span>
                                                </div>
                                            )}
                                        </div>
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

                                    {/* 操作列 */}
                                    <div className="col-span-1 flex justify-end items-center gap-2">
                                        <button
                                            onClick={() => openCreditsPanel(user)}
                                            className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all"
                                            title="积分管理"
                                        >
                                            <CreditCard className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => openPasswordModal(user)}
                                            className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                                            title="修改密码"
                                        >
                                            <Key className="w-4 h-4" />
                                        </button>
                                        {onViewConversations && (
                                            <button
                                                onClick={() => onViewConversations(user.id, user.email, user.nickname)}
                                                className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"
                                                title="查看对话"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
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
            {batchAction && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
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
                                        value={batchConfirmPassword}
                                        onInput={(e) => setBatchConfirmPassword((e.target as HTMLInputElement).value)}
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
                </div>,
                document.body
            )}

            {activeUser && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-400 flex items-center justify-center font-bold text-white text-base sm:text-lg shadow-sm">
                                    {activeUser.nickname?.[0] || activeUser.email[0].toUpperCase()}
                                </div>
                                <div>
                                    <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-tight">
                                        {activeUser.nickname || '未设置昵称'}
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-0.5">
                                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{activeUser.email}</div>
                                        <div className="hidden sm:block w-1 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
                                        <div className="text-xs font-semibold text-amber-600">当前余额: {activeUser.credit_balance}</div>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={closeCreditsPanel}
                                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all shadow-sm"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
                            {/* 当前余额显示 */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center">
                                    <div className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase">灵感值</div>
                                    <div className="text-xl font-mono font-bold text-amber-700 dark:text-amber-300">{activeUser.credit_balance}</div>
                                </div>
                                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-center">
                                    <div className="text-xs text-purple-600 dark:text-purple-400 font-bold uppercase">Pro3 次数</div>
                                    <div className="text-xl font-mono font-bold text-purple-700 dark:text-purple-300">{activeUser.pro3_balance}</div>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                                    <div className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Flash 次数</div>
                                    <div className="text-xl font-mono font-bold text-blue-700 dark:text-blue-300">{activeUser.flash_balance}</div>
                                </div>
                            </div>

                            {/* 快速调整表单 */}
                            <div className="bg-amber-50/50 dark:bg-amber-900/5 rounded-2xl border border-amber-100 dark:border-amber-900/30 p-4">
                                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-bold text-sm mb-4">
                                    <CreditCard className="w-4 h-4 text-amber-500" />
                                    分配灵感值
                                </div>
                                <div className="flex flex-col md:flex-row items-end gap-3">
                                    <div className="w-full md:w-28">
                                        <label className="text-[10px] font-bold text-amber-700/70 dark:text-amber-400/50 mb-1.5 block uppercase tracking-wider">类型</label>
                                        <select
                                            value={creditType}
                                            onInput={(e) => setCreditType((e.target as HTMLSelectElement).value as 'credit' | 'pro3' | 'flash')}
                                            className="w-full px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 outline-none focus:ring-2 focus:ring-amber-500 text-sm h-10"
                                        >
                                            <option value="credit">灵感值</option>
                                            <option value="pro3">Pro3 次数</option>
                                            <option value="flash">Flash 次数</option>
                                        </select>
                                    </div>
                                    <div className="w-full md:w-32">
                                        <label className="text-[10px] font-bold text-amber-700/70 dark:text-amber-400/50 mb-1.5 block uppercase tracking-wider">调整数额</label>
                                        <input
                                            type="number"
                                            value={creditAdjustAmount}
                                            onInput={(e) => setCreditAdjustAmount(Number((e.target as HTMLInputElement).value))}
                                            placeholder="±100"
                                            className="w-full px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 outline-none focus:ring-2 focus:ring-amber-500 text-sm h-10"
                                        />
                                    </div>
                                    <div className="flex-1 w-full">
                                        <label className="text-[10px] font-bold text-amber-700/70 dark:text-amber-400/50 mb-1.5 block uppercase tracking-wider">调整原因</label>
                                        <input
                                            type="text"
                                            value={creditAdjustReason}
                                            onInput={(e) => setCreditAdjustReason((e.target as HTMLInputElement).value)}
                                            placeholder="如：售后补偿、系统奖励"
                                            className="w-full px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 outline-none focus:ring-2 focus:ring-amber-500 text-sm h-10"
                                        />
                                    </div>
                                    <button
                                        onClick={handleAdjustCreditsWithType}
                                        disabled={creditAdjustLoading}
                                        className="h-10 px-6 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-50 transition-all shadow-md shadow-amber-500/20 text-sm whitespace-nowrap"
                                    >
                                        {creditAdjustLoading ? '处理中...' : '确认调整'}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/30 dark:bg-gray-900 flex flex-col">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <div className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200">
                                            <List className="w-4 h-4 text-amber-500" />
                                            积分变动记录
                                        </div>
                                        <div className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full uppercase">Count: {creditHistory?.total ?? 0}</div>
                                    </div>
                                    <div className="space-y-2 flex-1 min-h-[160px]">
                                        {creditHistoryLoading ? (
                                            <div className="text-center text-gray-400 py-10 text-xs">加载中...</div>
                                        ) : creditHistory?.items?.length ? (
                                            creditHistory.items.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800/50 bg-white dark:bg-gray-900 px-3 py-2.5 transition-shadow hover:shadow-sm">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                                            {item.description || creditTypeLabel(item.type)}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 mt-0.5">
                                                            {formatShortDate(item.created_at)} · 结余 {item.balance_after}
                                                        </div>
                                                    </div>
                                                    <div className={`font-mono text-xs font-bold text-right ${item.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                        {item.amount > 0 ? `+${item.amount}` : item.amount}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center text-gray-400 py-10 text-xs">暂无变动记录</div>
                                        )}
                                    </div>
                                    {creditHistory && creditHistory.total > creditHistoryPageSize && (
                                        <div className="flex items-center justify-between mt-4 px-1">
                                            <span className="text-[10px] font-bold text-gray-400">
                                                Page {creditHistoryPage} / {Math.ceil(creditHistory.total / creditHistoryPageSize)}
                                            </span>
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={() => setCreditHistoryPage((p) => Math.max(1, p - 1))}
                                                    disabled={creditHistoryPage === 1}
                                                    className="p-1 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-[10px] font-bold hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 transition-all"
                                                >
                                                    Previous
                                                </button>
                                                <button
                                                    onClick={() => setCreditHistoryPage((p) => p + 1)}
                                                    disabled={creditHistoryPage >= Math.ceil(creditHistory.total / creditHistoryPageSize)}
                                                    className="p-1 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-[10px] font-bold hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 transition-all"
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/30 dark:bg-gray-900 flex flex-col">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <div className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200">
                                            <Clock className="w-4 h-4 text-emerald-500" />
                                            消耗明细
                                        </div>
                                        <div className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full uppercase">Count: {usageLogs?.total ?? 0}</div>
                                    </div>
                                    <div className="space-y-2 flex-1 min-h-[160px]">
                                        {usageLoading ? (
                                            <div className="text-center text-gray-400 py-10 text-xs">加载中...</div>
                                        ) : usageLogs?.items?.length ? (
                                            usageLogs.items.map((log) => (
                                                <div key={log.id} className="rounded-xl border border-gray-100 dark:border-gray-800/50 bg-white dark:bg-gray-900 px-3 py-2.5 transition-shadow hover:shadow-sm">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs font-bold text-gray-900 dark:text-white capitalize">{log.model_name.replace('gemini-', '')}</span>
                                                        <span className="font-mono text-xs font-bold text-rose-500">-{log.credits_used}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                                                        <span>{log.request_type}</span>
                                                        <span>{formatShortDate(log.created_at)}</span>
                                                    </div>
                                                    {log.prompt_preview && (
                                                        <div className="text-[10px] text-gray-500 mt-1 line-clamp-1 italic bg-gray-50 dark:bg-gray-800/30 px-1.5 py-0.5 rounded border border-gray-100 dark:border-gray-800/50">{log.prompt_preview}</div>
                                                    )}
                                                    {!log.is_success && (
                                                        <div className="text-[10px] text-rose-500 mt-1 font-medium bg-rose-50 dark:bg-rose-900/10 px-1.5 py-0.5 rounded border border-rose-100 dark:border-rose-900/20">Error: {log.error_message || 'Unknown'}</div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center text-gray-400 py-10 text-xs">暂无消耗记录</div>
                                        )}
                                    </div>
                                    {usageLogs && usageLogs.total > usagePageSize && (
                                        <div className="flex items-center justify-between mt-4 px-1">
                                            <span className="text-[10px] font-bold text-gray-400">
                                                Page {usagePage} / {Math.ceil(usageLogs.total / usagePageSize)}
                                            </span>
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={() => setUsagePage((p) => Math.max(1, p - 1))}
                                                    disabled={usagePage === 1}
                                                    className="p-1 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-[10px] font-bold hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 transition-all"
                                                >
                                                    Previous
                                                </button>
                                                <button
                                                    onClick={() => setUsagePage((p) => p + 1)}
                                                    disabled={usagePage >= Math.ceil(usageLogs.total / usagePageSize)}
                                                    className="p-1 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-[10px] font-bold hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 transition-all"
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 创建用户模态框 */}
            {showCreateUserModal && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">新建用户</h3>
                                <button
                                    onClick={() => setShowCreateUserModal(false)}
                                    className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        邮箱地址 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={newUserEmail}
                                        onInput={(e) => setNewUserEmail((e.target as HTMLInputElement).value)}
                                        placeholder="user@example.com"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        密码 <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={newUserPassword}
                                            onInput={(e) => setNewUserPassword((e.target as HTMLInputElement).value)}
                                            placeholder="至少6个字符"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        昵称
                                    </label>
                                    <input
                                        type="text"
                                        value={newUserNickname}
                                        onInput={(e) => setNewUserNickname((e.target as HTMLInputElement).value)}
                                        placeholder="可选"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">灵感值</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={newUserCredit}
                                            onInput={(e) => setNewUserCredit(Number((e.target as HTMLInputElement).value))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pro3 次数</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={newUserPro3}
                                            onInput={(e) => setNewUserPro3(Number((e.target as HTMLInputElement).value))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Flash 次数</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={newUserFlash}
                                            onInput={(e) => setNewUserFlash(Number((e.target as HTMLInputElement).value))}
                                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        标签 (逗号分隔)
                                    </label>
                                    <input
                                        type="text"
                                        value={newUserTags}
                                        onInput={(e) => setNewUserTags((e.target as HTMLInputElement).value)}
                                        placeholder="如: vip,测试用户"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        备注
                                    </label>
                                    <textarea
                                        value={newUserNote}
                                        onInput={(e) => setNewUserNote((e.target as HTMLTextAreaElement).value)}
                                        placeholder="可选"
                                        rows={2}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isAdmin"
                                        checked={newUserIsAdmin}
                                        onInput={(e) => setNewUserIsAdmin((e.target as HTMLInputElement).checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                                    />
                                    <label htmlFor="isAdmin" className="text-sm text-gray-700 dark:text-gray-300">
                                        设为管理员
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowCreateUserModal(false)}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleCreateUser}
                                    disabled={creatingUser}
                                    className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 transition"
                                >
                                    {creatingUser ? '创建中...' : '创建用户'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 修改密码模态框 */}
            {showPasswordModal && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">修改密码</h3>
                                <button
                                    onClick={() => setShowPasswordModal(false)}
                                    className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                                为用户 <span className="font-bold text-gray-700 dark:text-gray-300">{passwordUserEmail}</span> 设置新密码
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        新密码 <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showNewPassword ? 'text' : 'password'}
                                            value={newPassword}
                                            onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
                                            placeholder="至少6个字符"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        确认密码 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                                        placeholder="再次输入新密码"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowPasswordModal(false)}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleChangePassword}
                                    disabled={changingPassword}
                                    className="flex-1 px-4 py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50 transition"
                                >
                                    {changingPassword ? '修改中...' : '确认修改'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
