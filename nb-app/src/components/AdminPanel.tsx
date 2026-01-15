/**
 * 管理员后台面板
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Users, Key, Gift, BarChart3, Plus, Trash2, RefreshCw, Copy, Check, Loader2, ShieldCheck, MessageSquare, Send, UserCog, User, FileText, Coins, Undo2, Download, Calendar, TrendingUp, ArrowUpDown, ChevronDown, ChevronUp, Eye, EyeOff, Power, Clock, Filter } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import {
    getTokens, addToken, deleteToken, updateToken, checkTokenQuota, TokenInfo,
    getModelPricing, createModelPricing, updateModelPricing, ModelPricingInfo,
    generateRedeemCodes, getRedeemCodes, RedeemCodeInfo,
    getUsers, getUsersAdvanced, getUsersStats, setUserActiveStatus,
    batchUpdateUserStatus, batchAdjustCredits, exportUsers, requestAdminActionConfirmation,
    getUserCreditHistory, adjustUserCredits, updateUserNote, AdminUser, UserFilters, UserStats,
    getDashboardStats, DashboardStats, exportStats,
} from '../services/adminService';
import { formatBalance } from '../services/balanceService';
import { getApiBaseUrl } from '../utils/endpointUtils';
import { getAllTickets, getTicketDetail, replyTicket, updateTicketStatus, getAdminUnreadCount, Ticket, TicketMessage, TICKET_CATEGORIES, TICKET_STATUS_LABELS, TicketCategory } from '../services/ticketService';

interface AdminPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

type TabType = 'dashboard' | 'tokens' | 'pricing' | 'codes' | 'users' | 'tickets';
type SortKey = 'priority' | 'remaining_quota' | 'last_used_at';

// 积分调整记录接口，用于撤销功能
interface CreditAdjustmentRecord {
    userId: string;
    userName: string;
    amount: number;
    timestamp: number;
}

export const AdminPanel = ({ isOpen, onClose }: AdminPanelProps) => {
    const { user } = useAuthStore();
    const { settings } = useAppStore();
    const { addToast } = useUiStore();
    const apiBaseUrl = getApiBaseUrl(settings.customEndpoint);
    const [activeTab, setActiveTab] = useState<TabType>('dashboard');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // 新增：细粒度 loading 状态
    const [addingToken, setAddingToken] = useState(false);
    const [savingTokenUrl, setSavingTokenUrl] = useState<Record<string, boolean>>({});
    const [addingPricing, setAddingPricing] = useState(false);
    const [savingPricing, setSavingPricing] = useState<string | null>(null);
    const [adjustingCredits, setAdjustingCredits] = useState(false);
    const [savingNote, setSavingNote] = useState(false);
    const [generatingCodes, setGeneratingCodes] = useState(false);
    const [sendingReply, setSendingReply] = useState(false);

    // 新增：积分调整撤销记录
    const [lastCreditAdjustment, setLastCreditAdjustment] = useState<CreditAdjustmentRecord | null>(null);

    // Dashboard
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [modelStatsLoaded, setModelStatsLoaded] = useState(false);
    const [dailyStatsLoaded, setDailyStatsLoaded] = useState(false);
    const [modelStatsLoading, setModelStatsLoading] = useState(false);
    const [dailyStatsLoading, setDailyStatsLoading] = useState(false);
    const [statsStartDate, setStatsStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return d.toISOString().split('T')[0];
    });
    const [statsEndDate, setStatsEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [exportingStats, setExportingStats] = useState(false);

    // Tokens
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenKey, setNewTokenKey] = useState('');
    const [newTokenBaseUrl, setNewTokenBaseUrl] = useState('');
    const [newTokenPriority, setNewTokenPriority] = useState(0);
    const [checkingQuotaTokenId, setCheckingQuotaTokenId] = useState<string | null>(null);
    const [batchRefreshingQuota, setBatchRefreshingQuota] = useState(false);
    const [batchRefreshProgress, setBatchRefreshProgress] = useState({ current: 0, total: 0 });
    const [tokenBaseUrlDrafts, setTokenBaseUrlDrafts] = useState<Record<string, string>>({});
    const [isTokenDrawerOpen, setIsTokenDrawerOpen] = useState(false);
    const [tokenSecrets, setTokenSecrets] = useState<Record<string, string>>({});
    const [revealedTokenIds, setRevealedTokenIds] = useState<Record<string, boolean>>({});
    const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
    const [expandedTokens, setExpandedTokens] = useState<Record<string, boolean>>({});
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'priority',
        direction: 'desc',
    });

    // Model Pricing
    const [pricing, setPricing] = useState<ModelPricingInfo[]>([]);
    const [pricingDrafts, setPricingDrafts] = useState<Record<string, number>>({});
    const [newModelName, setNewModelName] = useState('');
    const [newModelCredits, setNewModelCredits] = useState(10);

    // Redeem Codes
    const [codes, setCodes] = useState<RedeemCodeInfo[]>([]);
    const [generateCount, setGenerateCount] = useState(10);
    const [generateAmount, setGenerateAmount] = useState(0);
    const [generatePro3Amount, setGeneratePro3Amount] = useState(10);
    const [generateFlashAmount, setGenerateFlashAmount] = useState(10);
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
    const [copiedCodes, setCopiedCodes] = useState(false);

    // Users
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [usersTotal, setUsersTotal] = useState(0);
    const [userPage, setUserPage] = useState(1);
    const [userPageSize, setUserPageSize] = useState(20);
    const [userSearch, setUserSearch] = useState('');
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [adjustAmount, setAdjustAmount] = useState(0);
    const [adjustReason, setAdjustReason] = useState('');
    const [editingNoteUserId, setEditingNoteUserId] = useState<string | null>(null);
    const [noteContent, setNoteContent] = useState('');
    const [userStats, setUserStats] = useState<UserStats | null>(null);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [creditHistoryUserId, setCreditHistoryUserId] = useState<string | null>(null);
    const [creditHistory, setCreditHistory] = useState<{ items: any[]; total: number } | null>(null);

    // 用户筛选状态
    const [userFilters, setUserFilters] = useState<UserFilters>({
        is_admin: undefined,
        is_active: undefined,
        min_balance: undefined,
        max_balance: undefined,
        created_after: undefined,
        created_before: undefined,
    });
    const [showFilters, setShowFilters] = useState(false);

    // 批量操作状态
    const [batchOperation, setBatchOperation] = useState<'status' | 'credits' | null>(null);
    const [batchReason, setBatchReason] = useState('');
    const [batchAmount, setBatchAmount] = useState(0);
    const [batchStatus, setBatchStatus] = useState<boolean | null>(null);
    const [processingBatch, setProcessingBatch] = useState(false);
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
    const [batchConfirmPassword, setBatchConfirmPassword] = useState('');
    const [batchConfirmError, setBatchConfirmError] = useState('');
    const [batchConfirming, setBatchConfirming] = useState(false);
    const [pendingBatchPayload, setPendingBatchPayload] = useState<{
        type: 'status' | 'credits';
        userIds: string[];
        isActive?: boolean;
        amount?: number;
        reason: string;
    } | null>(null);

    // 余额调整弹窗状态
    const [creditModalOpen, setCreditModalOpen] = useState(false);
    const [creditModalUser, setCreditModalUser] = useState<AdminUser | null>(null);
    const [creditModalMode, setCreditModalMode] = useState<'add' | 'subtract'>('add');

    // Tickets
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
    const [ticketCategoryFilter, setTicketCategoryFilter] = useState('all');
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [adminReplyContent, setAdminReplyContent] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    if (!isOpen || !user?.is_admin) return null;

    const loadData = async () => {
        setIsLoading(true);
        setError('');
        try {
            if (activeTab === 'dashboard') {
                const data = await getDashboardStats(statsStartDate, statsEndDate, {
                    includeDailyStats: false,
                    includeModelStats: false,
                });
                setStats(data);
                setDailyStatsLoaded(false);
                setModelStatsLoaded(false);
            } else if (activeTab === 'tokens') {
                const data = await getTokens();
                setTokens(data);
            } else if (activeTab === 'pricing') {
                const data = await getModelPricing();
                setPricing(data);
            } else if (activeTab === 'codes') {
                const data = await getRedeemCodes();
                setCodes(data);
            } else if (activeTab === 'users') {
                const combinedFilters: UserFilters = {
                    ...userFilters,
                    search: userSearch || undefined,
                };
                const data = await getUsersAdvanced(userPage, combinedFilters);
                setUsers(data.users);
                setUsersTotal(data.total);
            } else if (activeTab === 'tickets') {
                const data = await getAllTickets(ticketStatusFilter, ticketCategoryFilter);
                setTickets(data);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const loadModelStats = async () => {
        if (!stats || modelStatsLoading) return;
        setModelStatsLoading(true);
        setError('');
        try {
            const data = await getDashboardStats(statsStartDate, statsEndDate, {
                includeDailyStats: false,
                includeModelStats: true,
            });
            setStats((prev) => prev ? { ...prev, ...data, daily_stats: prev.daily_stats } : data);
            setModelStatsLoaded(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setModelStatsLoading(false);
        }
    };

    const loadDailyStats = async () => {
        if (!stats || dailyStatsLoading) return;
        setDailyStatsLoading(true);
        setError('');
        try {
            const data = await getDashboardStats(statsStartDate, statsEndDate, {
                includeDailyStats: true,
                includeModelStats: false,
            });
            setStats((prev) => prev ? { ...prev, ...data, model_stats: prev.model_stats } : data);
            setDailyStatsLoaded(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDailyStatsLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'tickets') {
            loadData();
        }
    }, [ticketStatusFilter, ticketCategoryFilter]);

    useEffect(() => {
        if (selectedTicket && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedTicket?.messages]);

    useEffect(() => {
        if (isOpen && user?.is_admin) {
            loadData();
        }
    }, [isOpen, activeTab, user?.is_admin]);

    // 进入 tokens tab 时自动刷新所有 token 额度
    useEffect(() => {
        if (activeTab === 'tokens' && tokens.length > 0 && !batchRefreshingQuota) {
            handleBatchRefreshQuota(tokens);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, tokens.length]);

    // 轮询工单未读数量
    useEffect(() => {
        if (!isOpen || !user?.is_admin) return;

        const fetchUnreadCount = async () => {
            try {
                const data = await getAdminUnreadCount();
                setUnreadCount(data.unread_count);
            } catch (error) {
                console.debug('Failed to fetch unread count:', error);
            }
        };

        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);

        return () => clearInterval(interval);
    }, [isOpen, user?.is_admin]);

    useEffect(() => {
        const nextDrafts: Record<string, number> = {};
        pricing.forEach((item) => {
            nextDrafts[item.id] = item.credits_per_request;
        });
        setPricingDrafts(nextDrafts);
    }, [pricing]);

    useEffect(() => {
        const nextDrafts: Record<string, string> = {};
        tokens.forEach((token) => {
            nextDrafts[token.id] = token.base_url || '';
        });
        setTokenBaseUrlDrafts(nextDrafts);
    }, [tokens]);

    const lowBalanceThreshold = 10;

    const parseQuota = (quota?: number | null) => {
        const value = Number(quota);
        return Number.isNaN(value) ? null : value;
    };

    const formatQuota = (quota?: number | null) => {
        if (quota === null || quota === undefined || Number.isNaN(Number(quota))) return '--';
        const value = Number(quota);
        const isUnlimited = !Number.isFinite(value) || value === Infinity;
        return formatBalance(value, isUnlimited);
    };

    const getQuotaProgress = (quota?: number | null) => {
        const value = parseQuota(quota);
        if (value === null) return 0;
        if (!Number.isFinite(value)) return 100;
        const progress = Math.min(100, (value / lowBalanceThreshold) * 100);
        return value <= 0 ? 0 : Math.max(6, progress);
    };

    const isCooling = (token: TokenInfo) => {
        if (!token.cooldown_until || !token.is_active) return false;
        const cooldownTime = new Date(token.cooldown_until).getTime();
        return Number.isFinite(cooldownTime) && cooldownTime > Date.now();
    };

    const isLowBalance = (token: TokenInfo) => {
        const value = parseQuota(token.remaining_quota);
        if (value === null || !Number.isFinite(value)) return false;
        return value <= lowBalanceThreshold;
    };

    const formatDateTime = (value?: string | null) => {
        if (!value) return '--';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleString();
    };

    const getTokenStatus = (token: TokenInfo) => {
        if (!token.is_active) {
            return {
                label: '停用',
                dot: 'bg-gray-400',
                text: 'text-gray-500 dark:text-gray-400',
                detail: '已停用',
            };
        }
        if (isCooling(token)) {
            return {
                label: '冷却中',
                dot: 'bg-amber-500',
                text: 'text-amber-600 dark:text-amber-400',
                detail: `冷却至 ${formatDateTime(token.cooldown_until)}`,
            };
        }
        const failureNote = token.failure_count ? `失败 ${token.failure_count}` : '正常';
        return {
            label: '可用',
            dot: 'bg-green-500',
            text: 'text-green-600 dark:text-green-400',
            detail: failureNote,
        };
    };

    const tokenSummary = useMemo(() => {
        const coolingCount = tokens.filter(isCooling).length;
        const availableCount = tokens.filter((token) => token.is_active && !isCooling(token)).length;
        const lowBalanceCount = tokens.filter((token) => token.is_active && isLowBalance(token)).length;
        return {
            total: tokens.length,
            available: availableCount,
            cooling: coolingCount,
            lowBalance: lowBalanceCount,
        };
    }, [tokens]);

    const sortedTokens = useMemo(() => {
        const sorted = [...tokens];
        const direction = sortConfig.direction === 'asc' ? 1 : -1;
        sorted.sort((a, b) => {
            const getSortValue = (token: TokenInfo) => {
                if (sortConfig.key === 'priority') return token.priority ?? 0;
                if (sortConfig.key === 'remaining_quota') return parseQuota(token.remaining_quota) ?? -Infinity;
                if (sortConfig.key === 'last_used_at') {
                    return token.last_used_at ? new Date(token.last_used_at).getTime() : 0;
                }
                return 0;
            };
            const aValue = getSortValue(a);
            const bValue = getSortValue(b);
            if (aValue === bValue) return 0;
            return aValue > bValue ? direction : -direction;
        });
        return sorted;
    }, [tokens, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'desc' };
        });
    };

    const handleCopyTokenKey = async (tokenId: string, value: string) => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopiedTokenId(tokenId);
            setTimeout(() => setCopiedTokenId((current) => (current === tokenId ? null : current)), 2000);
        } catch (err) {
            addToast('复制失败，请手动复制', 'error');
        }
    };

    const handleRevealTokenKey = (tokenId: string) => {
        const secret = tokenSecrets[tokenId];
        if (!secret) {
            addToast('完整 Key 仅创建时可见', 'error');
            return;
        }
        if (!confirm('将在短时间内显示完整 Key，确认继续？')) return;
        setRevealedTokenIds((prev) => ({ ...prev, [tokenId]: true }));
        setTimeout(
            () => setRevealedTokenIds((prev) => ({ ...prev, [tokenId]: false })),
            10000
        );
    };

    // 导出统计数据为 CSV
    const handleExportStats = async (dataType: 'daily' | 'model' | 'user_growth') => {
        setExportingStats(true);
        try {
            const blob = await exportStats(statsStartDate, statsEndDate, dataType);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${dataType}_stats_${statsStartDate}_to_${statsEndDate}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            addToast('导出成功', 'success');
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setExportingStats(false);
        }
    };

    // 快速日期选择
    const setQuickDateRange = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days + 1);
        setStatsStartDate(start.toISOString().split('T')[0]);
        setStatsEndDate(end.toISOString().split('T')[0]);
    };

    const handleAddToken = async () => {
        if (!newTokenName || !newTokenKey) return;
        setAddingToken(true);
        try {
            const created = await addToken(
                newTokenName,
                newTokenKey,
                newTokenPriority,
                newTokenBaseUrl.trim() || apiBaseUrl
            );
            setTokenSecrets((prev) => ({ ...prev, [created.id]: newTokenKey }));
            setNewTokenName('');
            setNewTokenKey('');
            setNewTokenBaseUrl('');
            setNewTokenPriority(0);
            setIsTokenDrawerOpen(false);
            addToast('Token 添加成功', 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setAddingToken(false);
        }
    };

    const handleToggleToken = async (id: string, currentStatus: boolean) => {
        try {
            await updateToken(id, { is_active: !currentStatus });
            addToast('Token 状态已更新', 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        }
    };

    const handleDeleteToken = async (id: string) => {
        if (!confirm('确定要删除这个 Token 吗？')) return;
        try {
            await deleteToken(id);
            addToast('Token 已删除', 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        }
    };

    const handleCheckQuota = async (id: string) => {
        setCheckingQuotaTokenId(id);
        try {
            const baseUrl = tokenBaseUrlDrafts[id]?.trim() || apiBaseUrl;
            const updated = await checkTokenQuota(id, baseUrl);
            // 更新列表中的 token
            setTokens(prev => prev.map(t => t.id === id ? { ...t, remaining_quota: updated.remaining_quota } : t));
            addToast('额度查询成功', 'success');
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setCheckingQuotaTokenId(null);
        }
    };

    const handleBatchRefreshQuota = async (tokenList: TokenInfo[]) => {
        if (tokenList.length === 0) return;
        setBatchRefreshingQuota(true);
        setBatchRefreshProgress({ current: 0, total: tokenList.length });

        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        for (let i = 0; i < tokenList.length; i++) {
            const token = tokenList[i];
            setBatchRefreshProgress({ current: i + 1, total: tokenList.length });
            try {
                const baseUrl = tokenBaseUrlDrafts[token.id]?.trim() || apiBaseUrl;
                const updated = await checkTokenQuota(token.id, baseUrl);
                setTokens(prev => prev.map(t => t.id === token.id ? { ...t, remaining_quota: updated.remaining_quota } : t));
            } catch (err) {
                console.error(`Token ${token.name} 额度查询失败:`, err);
            }
            // 延迟 500ms 避免请求过快
            if (i < tokenList.length - 1) {
                await delay(500);
            }
        }

        setBatchRefreshingQuota(false);
        addToast(`批量刷新完成 (${tokenList.length} 个 Token)`, 'success');
    };

    const handleSaveTokenBaseUrl = async (id: string) => {
        const baseUrl = tokenBaseUrlDrafts[id]?.trim() || null;
        const current = tokens.find(t => t.id === id)?.base_url || null;
        if ((current || null) === baseUrl) return;
        setSavingTokenUrl(prev => ({ ...prev, [id]: true }));
        try {
            const updated = await updateToken(id, { base_url: baseUrl });
            setTokens(prev => prev.map(t => t.id === id ? { ...t, base_url: updated.base_url } : t));
            addToast('接口地址已保存', 'success');
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setSavingTokenUrl(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleAddPricing = async () => {
        if (!newModelName.trim() || newModelCredits <= 0) return;
        setAddingPricing(true);
        try {
            await createModelPricing(newModelName.trim(), newModelCredits);
            setNewModelName('');
            setNewModelCredits(10);
            addToast('计费模型添加成功', 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setAddingPricing(false);
        }
    };

    const handleUpdatePricing = async (id: string) => {
        const nextValue = pricingDrafts[id];
        if (!nextValue || nextValue <= 0) {
            addToast('扣点次数必须大于 0', 'error');
            return;
        }
        setSavingPricing(id);
        try {
            await updateModelPricing(id, nextValue);
            addToast('计费已更新', 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setSavingPricing(null);
        }
    };

    const handleAdjustCredits = async (userId: string) => {
        if (adjustAmount === 0) return;
        const targetUser = users.find(u => u.id === userId);
        setAdjustingCredits(true);
        try {
            await adjustUserCredits(userId, adjustAmount, '管理员手动调整');
            // 记录调整，用于撤销
            setLastCreditAdjustment({
                userId,
                userName: targetUser?.nickname || targetUser?.email || userId,
                amount: adjustAmount,
                timestamp: Date.now()
            });
            setEditingUserId(null);
            setAdjustAmount(0);
            addToast(`积分调整成功 (${adjustAmount > 0 ? '+' : ''}${adjustAmount})`, 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setAdjustingCredits(false);
        }
    };

    // 新增：撤销积分调整
    const handleUndoCredits = async () => {
        if (!lastCreditAdjustment) return;
        const { userId, amount, userName } = lastCreditAdjustment;
        setAdjustingCredits(true);
        try {
            await adjustUserCredits(userId, -amount, '撤销调整');
            addToast(`已撤销对 ${userName} 的积分调整`, 'success');
            setLastCreditAdjustment(null);
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setAdjustingCredits(false);
        }
    };

    const handleUpdateNote = async (userId: string) => {
        setSavingNote(true);
        try {
            await updateUserNote(userId, noteContent);
            setEditingNoteUserId(null);
            setNoteContent('');
            addToast('备注已保存', 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setSavingNote(false);
        }
    };

    // ============ 用户管理扩展函数 ============

    // 加载用户统计
    const loadUserStats = async () => {
        try {
            const data = await getUsersStats();
            setUserStats(data);
        } catch (err) {
            console.error('加载用户统计失败:', err);
        }
    };

    // 重置筛选条件
    const handleResetFilters = () => {
        setUserFilters({
            is_admin: undefined,
            is_active: undefined,
            min_balance: undefined,
            max_balance: undefined,
            created_after: undefined,
            created_before: undefined,
        });
        setUserSearch('');
        setUserPage(1);
        setSelectedUserIds(new Set());
    };

    // 应用筛选条件
    const handleApplyFilters = () => {
        setUserPage(1);
        setSelectedUserIds(new Set());
        loadData();
    };

    // 全选/取消全选
    const handleSelectAll = () => {
        if (selectedUserIds.size === users.length) {
            setSelectedUserIds(new Set());
        } else {
            setSelectedUserIds(new Set(users.map(u => u.id)));
        }
    };

    // 选择单个用户
    const handleSelectUser = (userId: string) => {
        const newSelected = new Set(selectedUserIds);
        if (newSelected.has(userId)) {
            newSelected.delete(userId);
        } else {
            newSelected.add(userId);
        }
        setSelectedUserIds(newSelected);
    };

    // 打开批量操作
    const openBatchOperation = (type: 'status' | 'credits') => {
        if (selectedUserIds.size === 0) {
            addToast('请先选择用户', 'error');
            return;
        }
        setBatchOperation(type);
        setBatchReason('');
        setBatchAmount(0);
        setBatchStatus(null);
    };

    // 执行批量操作
    const handleBatchOperation = async () => {
        if (selectedUserIds.size === 0) return;
        if (!batchReason.trim()) {
            addToast('请填写操作原因', 'error');
            return;
        }
        const trimmedReason = batchReason.trim();
        if (trimmedReason.length < 4) {
            addToast('操作原因至少 4 个字符', 'error');
            return;
        }
        const userIds = Array.from(selectedUserIds);

        if (batchOperation === 'status' && batchStatus !== null) {
            setPendingBatchPayload({
                type: 'status',
                userIds,
                isActive: batchStatus,
                reason: trimmedReason,
            });
        } else if (batchOperation === 'credits' && batchAmount !== 0) {
            setPendingBatchPayload({
                type: 'credits',
                userIds,
                amount: batchAmount,
                reason: trimmedReason,
            });
        } else {
            addToast('请完善批量操作参数', 'error');
            return;
        }

        setBatchConfirmPassword('');
        setBatchConfirmError('');
        setBatchConfirmOpen(true);
    };

    const closeBatchConfirm = () => {
        setBatchConfirmOpen(false);
        setBatchConfirmPassword('');
        setBatchConfirmError('');
        setPendingBatchPayload(null);
    };

    const executeBatchOperation = async () => {
        if (!pendingBatchPayload) return;
        if (!batchConfirmPassword.trim()) {
            setBatchConfirmError('请输入管理员密码完成二次确认');
            return;
        }

        setBatchConfirming(true);
        setProcessingBatch(true);
        setBatchConfirmError('');

        try {
            const purpose = pendingBatchPayload.type === 'status' ? 'batch_status' : 'batch_credits';
            const confirmation = await requestAdminActionConfirmation(purpose, batchConfirmPassword.trim());

            if (pendingBatchPayload.type === 'status' && pendingBatchPayload.isActive !== undefined) {
                await batchUpdateUserStatus(
                    pendingBatchPayload.userIds,
                    pendingBatchPayload.isActive,
                    pendingBatchPayload.reason,
                    confirmation.confirm_token
                );
                addToast(`已批量${pendingBatchPayload.isActive ? '启用' : '禁用'} ${pendingBatchPayload.userIds.length} 个用户`, 'success');
            } else if (pendingBatchPayload.type === 'credits' && pendingBatchPayload.amount !== undefined) {
                await batchAdjustCredits(
                    pendingBatchPayload.userIds,
                    pendingBatchPayload.amount,
                    pendingBatchPayload.reason,
                    confirmation.confirm_token
                );
                addToast(`已批量调整 ${pendingBatchPayload.userIds.length} 个用户积分`, 'success');
            }

            setBatchOperation(null);
            closeBatchConfirm();
            setSelectedUserIds(new Set());
            loadData();
        } catch (err) {
            const message = (err as Error).message;
            setBatchConfirmError(message);
        } finally {
            setBatchConfirming(false);
            setProcessingBatch(false);
        }
    };

    // 打开余额调整弹窗
    const openCreditModal = (user: AdminUser) => {
        setCreditModalUser(user);
        setAdjustAmount(0);
        setAdjustReason('');
        setCreditModalMode('add');
        setCreditModalOpen(true);
    };

    // 执行余额调整
    const handleCreditAdjust = async () => {
        if (!creditModalUser) return;
        if (!adjustReason.trim()) {
            addToast('请填写调整原因', 'error');
            return;
        }

        const finalAmount = creditModalMode === 'add' ? adjustAmount : -adjustAmount;
        if (finalAmount === 0) {
            addToast('调整金额不能为0', 'error');
            return;
        }

        setAdjustingCredits(true);
        try {
            await adjustUserCredits(creditModalUser.id, finalAmount, adjustReason);
            addToast(`积分调整成功 (${finalAmount > 0 ? '+' : ''}${finalAmount})`, 'success');
            setCreditModalOpen(false);
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setAdjustingCredits(false);
        }
    };

    // 加载积分历史
    const loadCreditHistory = async (userId: string) => {
        if (creditHistoryUserId === userId) {
            setCreditHistoryUserId(null);
            setCreditHistory(null);
            return;
        }
        try {
            const data = await getUserCreditHistory(userId, 3);
            setCreditHistoryUserId(userId);
            setCreditHistory(data);
        } catch (err) {
            addToast((err as Error).message, 'error');
        }
    };

    // 设置用户状态
    const handleSetUserStatus = async (userId: string, isActive: boolean) => {
        const reason = prompt(`请输入${isActive ? '启用' : '禁用'}原因（必填）：`);
        const trimmedReason = reason?.trim() || '';
        if (!trimmedReason) {
            addToast('操作原因不能为空', 'error');
            return;
        }
        if (trimmedReason.length < 4) {
            addToast('操作原因至少 4 个字符', 'error');
            return;
        }

        try {
            await setUserActiveStatus(userId, isActive, trimmedReason);
            addToast(`用户已${isActive ? '启用' : '禁用'}`, 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        }
    };

    // 导出用户数据
    const handleExportUsers = async () => {
        try {
            const combinedFilters: UserFilters = {
                ...userFilters,
                search: userSearch || undefined,
            };
            await exportUsers(combinedFilters);
            addToast('导出成功', 'success');
        } catch (err) {
            addToast((err as Error).message, 'error');
        }
    };

    // 进入 users tab 时加载统计
    useEffect(() => {
        if (activeTab === 'users' && !userStats) {
            loadUserStats();
        }
    }, [activeTab]);

    const handleGenerateCodes = async () => {
        setGeneratingCodes(true);
        try {
            const result = await generateRedeemCodes(
                generateCount,
                generateAmount,
                generatePro3Amount,
                generateFlashAmount
            );
            setGeneratedCodes(result.codes);
            addToast(`成功生成 ${result.codes.length} 个兑换码`, 'success');
            loadData();
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setGeneratingCodes(false);
        }
    };

    const handleCopyCodes = () => {
        navigator.clipboard.writeText(generatedCodes.join('\n'));
        setCopiedCodes(true);
        setTimeout(() => setCopiedCodes(false), 2000);
    };

    const loadTicketDetail = async (id: string) => {
        try {
            const data = await getTicketDetail(id);
            setSelectedTicket(data);
        } catch (err) {
            addToast((err as Error).message, 'error');
        }
    };

    const handleAdminReply = async () => {
        if (!selectedTicket || !adminReplyContent.trim()) return;
        setSendingReply(true);
        try {
            await replyTicket(selectedTicket.id, adminReplyContent);
            setAdminReplyContent('');
            addToast('回复已发送', 'success');
            await loadTicketDetail(selectedTicket.id);
        } catch (err) {
            addToast((err as Error).message, 'error');
        } finally {
            setSendingReply(false);
        }
    };

    const handleUpdateTicketStatus = async (status: string) => {
        if (!selectedTicket) return;
        try {
            // Optimistic update
            setSelectedTicket({ ...selectedTicket, status: status as any });

            await updateTicketStatus(selectedTicket.id, status);
            loadData(); // Refresh list to reflect changes
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const tabs = [
        { id: 'dashboard', label: '统计', icon: BarChart3 },
        { id: 'tokens', label: 'Token池', icon: Key },
        { id: 'pricing', label: '计费', icon: Coins },
        { id: 'codes', label: '兑换码', icon: Gift },
        { id: 'users', label: '用户', icon: Users },
        { id: 'tickets', label: '工单', icon: MessageSquare },
    ] as const;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
            <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col border border-white/20">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-cream-200 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-cream-100 rounded-xl">
                            <ShieldCheck className="w-5 h-5 text-cream-600" />
                        </div>
                        <h2 className="text-xl font-bold text-cream-950 dark:text-cream-50">管理后台</h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-cream-100 dark:hover:bg-gray-800 transition text-cream-400 hover:text-cream-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-cream-200 dark:border-gray-800 px-4 bg-cream-50/80 dark:bg-gray-900/50">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setActiveTab(tab.id);
                                setError('');
                                setGeneratedCodes([]);
                            }}
                            className="relative flex items-center gap-2 px-5 py-4 text-sm font-bold border-b-2 transition-all shrink-0"
                        >
                            <span className={`flex items-center gap-2 ${activeTab === tab.id
                                ? 'border-cream-600 text-cream-700 dark:text-cream-100 bg-white/50 dark:bg-gray-800/50'
                                : 'border-transparent text-cream-400 hover:text-cream-600 dark:hover:text-cream-200'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </span>
                            {tab.id === 'tickets' && unreadCount > 0 && (
                                <span className="absolute -top-1 right-2 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                            )}
                        </button>
                    ))}
                    <button onClick={loadData} className="ml-auto flex items-center gap-1.5 px-3 text-xs text-cream-400 hover:text-cream-600 dark:hover:text-cream-200 transition-colors">
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>刷新</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-white dark:bg-gray-900">
                    {error && (
                        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/20 text-rose-600 dark:text-rose-400 rounded-2xl text-sm shadow-sm">
                            {error}
                        </div>
                    )}

                    {isLoading && !stats && !tokens.length && !pricing.length && !codes.length && !users.length && !tickets.length ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Loader2 className="w-10 h-10 animate-spin text-cream-400" />
                            <p className="text-cream-400 text-sm animate-pulse">加载数据中...</p>
                        </div>
                    ) : (
                        <>
                            {/* Dashboard */}
                            {activeTab === 'dashboard' && stats && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    {/* 日期选择器和操作区 */}
                                    <div className="flex flex-wrap items-center gap-3 p-4 bg-cream-50/50 dark:bg-gray-800/30 rounded-2xl border border-cream-100 dark:border-gray-700">
                                        <Calendar className="w-4 h-4 text-cream-500" />
                                        <input
                                            type="date"
                                            value={statsStartDate}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStatsStartDate(e.currentTarget.value)}
                                            className="px-3 py-1.5 rounded-lg border border-cream-200 dark:border-gray-600 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-cream-500 outline-none"
                                        />
                                        <span className="text-cream-400">至</span>
                                        <input
                                            type="date"
                                            value={statsEndDate}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStatsEndDate(e.currentTarget.value)}
                                            className="px-3 py-1.5 rounded-lg border border-cream-200 dark:border-gray-600 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-cream-500 outline-none"
                                        />
                                        <button onClick={loadData} className="px-4 py-1.5 bg-cream-600 text-white rounded-lg text-sm font-bold hover:bg-cream-700 transition flex items-center gap-1.5">
                                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                                            查询
                                        </button>
                                        <div className="flex gap-1 ml-auto">
                                            <button onClick={() => setQuickDateRange(1)} className="px-2 py-1 text-xs text-cream-600 hover:bg-cream-100 dark:hover:bg-gray-700 rounded transition">今日</button>
                                            <button onClick={() => setQuickDateRange(7)} className="px-2 py-1 text-xs text-cream-600 hover:bg-cream-100 dark:hover:bg-gray-700 rounded transition">近7天</button>
                                            <button onClick={() => setQuickDateRange(30)} className="px-2 py-1 text-xs text-cream-600 hover:bg-cream-100 dark:hover:bg-gray-700 rounded transition">近30天</button>
                                        </div>
                                        <div className="relative group">
                                            <button
                                                disabled={exportingStats}
                                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                {exportingStats ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                导出
                                            </button>
                                            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-600 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px]">
                                                <button onClick={() => handleExportStats('daily')} className="w-full px-3 py-2 text-left text-sm hover:bg-cream-50 dark:hover:bg-gray-700 rounded-t-lg">每日统计</button>
                                                <button onClick={() => handleExportStats('model')} className="w-full px-3 py-2 text-left text-sm hover:bg-cream-50 dark:hover:bg-gray-700">模型使用</button>
                                                <button onClick={() => handleExportStats('user_growth')} className="w-full px-3 py-2 text-left text-sm hover:bg-cream-50 dark:hover:bg-gray-700 rounded-b-lg">用户增长</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 统计卡片 */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <StatCard label="总用户" value={stats.total_users} onClick={() => setActiveTab('users')} />
                                        <StatCard label="今日活跃" value={stats.active_users_today} onClick={() => setActiveTab('users')} />
                                        <StatCard label="今日请求" value={stats.total_requests_today} />
                                        <StatCard label="Token池状态" value={`${stats.available_tokens}/${stats.token_pool_count}`} onClick={() => setActiveTab('tokens')} />
                                    </div>

                                    {/* 图表区 */}
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* 模型使用排行 */}
                                        <div className="bg-cream-50/50 dark:bg-gray-800/50 rounded-2xl p-6 border border-cream-100 dark:border-gray-800">
                                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">模型使用排行</h3>
                                            {modelStatsLoaded ? (
                                                stats.model_stats.length > 0 ? (
                                                    <div className="space-y-3 max-h-64 overflow-auto">
                                                        {stats.model_stats.slice(0, 10).map((m, i) => {
                                                            const maxRequests = stats.model_stats[0]?.total_requests || 1;
                                                            return (
                                                                <div key={m.model_name} className="group">
                                                                    <div className="flex justify-between text-sm mb-1">
                                                                        <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${i < 3 ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'}`}>{i + 1}</span>
                                                                            <span className="truncate max-w-[150px]">{m.model_name}</span>
                                                                        </span>
                                                                        <span className="text-gray-500 text-xs">{m.total_requests}次 / {m.total_credits_used}分</span>
                                                                    </div>
                                                                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-cream-500 group-hover:bg-cream-400 transition-all"
                                                                            style={{ width: `${(m.total_requests / maxRequests) * 100}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-10 text-gray-500 text-sm italic">该时段暂无使用记录</div>
                                                )
                                            ) : (
                                                <div className="text-center py-8 text-gray-500 text-sm">
                                                    <button
                                                        type="button"
                                                        onClick={loadModelStats}
                                                        disabled={modelStatsLoading}
                                                        className="px-4 py-2 rounded-lg border border-cream-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-cream-50 dark:hover:bg-gray-800 disabled:opacity-60"
                                                    >
                                                        {modelStatsLoading ? '加载中...' : '加载模型统计'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* 用户增长趋势 */}
                                        <div className="bg-cream-50/50 dark:bg-gray-800/50 rounded-2xl p-6 border border-cream-100 dark:border-gray-800">
                                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <TrendingUp className="w-4 h-4" />
                                                用户增长趋势
                                            </h3>
                                            {stats.user_growth && stats.user_growth.length > 0 ? (
                                                <div className="space-y-2 max-h-64 overflow-auto">
                                                    {stats.user_growth.map((d, i) => (
                                                        <div key={d.date} className="flex items-center gap-3 text-sm">
                                                            <span className="text-gray-400 w-20 text-xs">{d.date.slice(5)}</span>
                                                            <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative">
                                                                <div
                                                                    className="h-full bg-green-500 rounded-full transition-all"
                                                                    style={{ width: `${(d.total_users / (stats.user_growth[stats.user_growth.length - 1]?.total_users || 1)) * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-gray-600 dark:text-gray-400 w-14 text-right text-xs">
                                                                +{d.new_users} / {d.total_users}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-10 text-gray-500 text-sm italic">暂无用户增长数据</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 每日请求趋势 */}
                                    <div className="bg-cream-50/50 dark:bg-gray-800/50 rounded-2xl p-6 border border-cream-100 dark:border-gray-800">
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">每日请求统计</h3>
                                        {dailyStatsLoaded ? (
                                            stats.daily_stats.length > 0 ? (
                                                <div className="space-y-2">
                                                    {stats.daily_stats.map(d => {
                                                        const maxRequests = Math.max(...stats.daily_stats.map(s => s.total_requests)) || 1;
                                                        return (
                                                            <div key={d.date} className="flex items-center gap-3">
                                                                <span className="text-gray-400 w-20 text-xs">{d.date.slice(5)}</span>
                                                                <div className="flex-1 h-5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-cream-500 rounded transition-all"
                                                                        style={{ width: `${(d.total_requests / maxRequests) * 100}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-gray-600 dark:text-gray-400 w-16 text-right text-xs">{d.total_requests}次</span>
                                                                <span className="text-gray-400 w-12 text-right text-xs">{d.unique_users}人</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-center py-10 text-gray-500 text-sm italic">该时段暂无请求数据</div>
                                            )
                                        ) : (
                                            <div className="text-center py-8 text-gray-500 text-sm">
                                                <button
                                                    type="button"
                                                    onClick={loadDailyStats}
                                                    disabled={dailyStatsLoading}
                                                    className="px-4 py-2 rounded-lg border border-cream-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-cream-50 dark:hover:bg-gray-800 disabled:opacity-60"
                                                >
                                                    {dailyStatsLoading ? '加载中...' : '加载每日统计'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Tokens */}
                            {activeTab === 'tokens' && (
                                <div className="space-y-5 animate-in fade-in duration-300">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Token 池</h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">集中查看状态、额度与使用趋势</p>
                                        </div>
                                        <button
                                            onClick={() => setIsTokenDrawerOpen(true)}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition"
                                        >
                                            <Plus className="w-4 h-4" />
                                            新增 Token
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        <TokenSummaryCard label="总数" value={tokenSummary.total} tone="neutral" />
                                        <TokenSummaryCard label="可用" value={tokenSummary.available} tone="ok" />
                                        <TokenSummaryCard label="冷却中" value={tokenSummary.cooling} tone="warn" />
                                        <TokenSummaryCard label="低余额" value={tokenSummary.lowBalance} tone="low" helper={`≤${lowBalanceThreshold}`} />
                                    </div>

                                    {batchRefreshingQuota && (
                                        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-sm">
                                                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                                                <span className="text-amber-700 dark:text-amber-300 font-medium">
                                                    正在刷新额度... ({batchRefreshProgress.current} / {batchRefreshProgress.total})
                                                </span>
                                            </div>
                                            <div className="w-32 h-2 bg-amber-200 dark:bg-amber-800/30 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                                                    style={{ width: `${(batchRefreshProgress.current / batchRefreshProgress.total) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                                        <div className="hidden md:block">
                                            <div className="overflow-auto max-h-[55vh]">
                                                <table className="w-full text-left text-sm">
                                                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
                                                        <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                            <th className="px-4 py-3 font-semibold">名称 / Key</th>
                                                            <th className="px-4 py-3 font-semibold">状态</th>
                                                            <th className="px-4 py-3 font-semibold text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSort('priority')}
                                                                    className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                                                                >
                                                                    优先级
                                                                    {sortConfig.key === 'priority' ? (
                                                                        sortConfig.direction === 'asc' ? (
                                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                                        ) : (
                                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                                        )
                                                                    ) : (
                                                                        <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />
                                                                    )}
                                                                </button>
                                                            </th>
                                                            <th className="px-4 py-3 font-semibold">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSort('remaining_quota')}
                                                                    className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                                                                >
                                                                    余额
                                                                    {sortConfig.key === 'remaining_quota' ? (
                                                                        sortConfig.direction === 'asc' ? (
                                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                                        ) : (
                                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                                        )
                                                                    ) : (
                                                                        <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />
                                                                    )}
                                                                </button>
                                                            </th>
                                                            <th className="px-4 py-3 font-semibold">Base URL</th>
                                                            <th className="px-4 py-3 font-semibold">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSort('last_used_at')}
                                                                    className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                                                                >
                                                                    最后使用
                                                                    {sortConfig.key === 'last_used_at' ? (
                                                                        sortConfig.direction === 'asc' ? (
                                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                                        ) : (
                                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                                        )
                                                                    ) : (
                                                                        <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />
                                                                    )}
                                                                </button>
                                                            </th>
                                                            <th className="px-4 py-3 font-semibold text-center">请求数</th>
                                                            <th className="px-4 py-3 font-semibold text-right">操作</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                        {sortedTokens.map((token) => {
                                                            const status = getTokenStatus(token);
                                                            const baseUrlDraft = tokenBaseUrlDrafts[token.id] ?? '';
                                                            const baseUrlCurrent = token.base_url ?? '';
                                                            const baseUrlDirty = baseUrlDraft.trim() !== baseUrlCurrent.trim();
                                                            const secretKey = tokenSecrets[token.id];
                                                            const isRevealed = revealedTokenIds[token.id] && !!secretKey;
                                                            const displayKey = isRevealed ? secretKey : token.api_key;
                                                            return (
                                                                <tr key={token.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/60">
                                                                    <td className="px-4 py-3">
                                                                        <div className="font-semibold text-gray-900 dark:text-gray-100">{token.name}</div>
                                                                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                                            <span className="font-mono truncate max-w-[140px]">{displayKey}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleCopyTokenKey(token.id, displayKey)}
                                                                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                                                                title="复制"
                                                                            >
                                                                                {copiedTokenId === token.id ? (
                                                                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                                                                ) : (
                                                                                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                                                                                )}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRevealTokenKey(token.id)}
                                                                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                                                                                title={secretKey ? '显示完整 Key' : '完整 Key 仅创建时可见'}
                                                                                disabled={!secretKey}
                                                                            >
                                                                                {isRevealed ? (
                                                                                    <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                                                                                ) : (
                                                                                    <Eye className="w-3.5 h-3.5 text-gray-400" />
                                                                                )}
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center gap-2" title={status.detail}>
                                                                            <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
                                                                            <span className={`text-xs font-semibold ${status.text}`}>{status.label}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{token.priority}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex flex-col gap-1">
                                                                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
                                                                                {formatQuota(token.remaining_quota)}
                                                                            </div>
                                                                            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                                                                                <div
                                                                                    className={`h-1.5 rounded-full ${isLowBalance(token) ? 'bg-amber-500' : 'bg-amber-300'}`}
                                                                                    style={{ width: `${getQuotaProgress(token.remaining_quota)}%` }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <input
                                                                                type="url"
                                                                                inputMode="url"
                                                                                value={baseUrlDraft}
                                                                                onChange={(e) =>
                                                                                    setTokenBaseUrlDrafts((prev) => ({ ...prev, [token.id]: e.currentTarget.value }))
                                                                                }
                                                                                placeholder="默认"
                                                                                className="w-full min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs focus:ring-2 focus:ring-amber-500 outline-none transition"
                                                                            />
                                                                            {baseUrlDirty && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleSaveTokenBaseUrl(token.id)}
                                                                                    disabled={savingTokenUrl[token.id]}
                                                                                    className="p-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40 transition disabled:opacity-50"
                                                                                >
                                                                                    {savingTokenUrl[token.id] ? (
                                                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                                    ) : (
                                                                                        <Check className="w-3.5 h-3.5" />
                                                                                    )}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">
                                                                        {formatDateTime(token.last_used_at)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-200 font-semibold tabular-nums">
                                                                        {token.total_requests}
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleCheckQuota(token.id)}
                                                                                disabled={checkingQuotaTokenId === token.id}
                                                                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                                                                                title="刷新额度"
                                                                            >
                                                                                <RefreshCw className={`w-4 h-4 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleToggleToken(token.id, token.is_active)}
                                                                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                                                                title={token.is_active ? '停用' : '启用'}
                                                                            >
                                                                                <Power className={`w-4 h-4 ${token.is_active ? 'text-gray-500' : 'text-green-600'}`} />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDeleteToken(token.id)}
                                                                                className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                                title="删除"
                                                                            >
                                                                                <Trash2 className="w-4 h-4 text-red-500" />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        {sortedTokens.length === 0 && (
                                                            <tr>
                                                                <td colSpan={8} className="py-16 text-center text-gray-400">
                                                                    <Key className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                                                    Token 池为空，请点击新增
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="md:hidden p-3 space-y-3">
                                            {sortedTokens.map((token) => {
                                                const status = getTokenStatus(token);
                                                const baseUrlDraft = tokenBaseUrlDrafts[token.id] ?? '';
                                                const baseUrlCurrent = token.base_url ?? '';
                                                const baseUrlDirty = baseUrlDraft.trim() !== baseUrlCurrent.trim();
                                                const secretKey = tokenSecrets[token.id];
                                                const isRevealed = revealedTokenIds[token.id] && !!secretKey;
                                                const displayKey = isRevealed ? secretKey : token.api_key;
                                                const isExpanded = expandedTokens[token.id];
                                                return (
                                                    <div key={token.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div>
                                                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{token.name}</div>
                                                                <div className="mt-1 flex items-center gap-2 text-xs">
                                                                    <span className={`inline-flex items-center gap-1 ${status.text}`} title={status.detail}>
                                                                        <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                                                                        {status.label}
                                                                    </span>
                                                                    <span className="text-gray-400">P{token.priority}</span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setExpandedTokens((prev) => ({ ...prev, [token.id]: !prev[token.id] }))
                                                                }
                                                                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                                            >
                                                                <ChevronDown className={`w-4 h-4 text-gray-400 transition ${isExpanded ? 'rotate-180' : ''}`} />
                                                            </button>
                                                        </div>

                                                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                            <span className="font-mono truncate">{displayKey}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyTokenKey(token.id, displayKey)}
                                                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                                                title="复制"
                                                            >
                                                                {copiedTokenId === token.id ? (
                                                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                                                ) : (
                                                                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                                                                )}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRevealTokenKey(token.id)}
                                                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                                                                title={secretKey ? '显示完整 Key' : '完整 Key 仅创建时可见'}
                                                                disabled={!secretKey}
                                                            >
                                                                {isRevealed ? (
                                                                    <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                                                                ) : (
                                                                    <Eye className="w-3.5 h-3.5 text-gray-400" />
                                                                )}
                                                            </button>
                                                        </div>

                                                        <div className="mt-3">
                                                            <div className="flex items-center justify-between text-xs text-gray-500">
                                                                <span>余额</span>
                                                                <span className="font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
                                                                    {formatQuota(token.remaining_quota)}
                                                                </span>
                                                            </div>
                                                            <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                                                                <div
                                                                    className={`h-1.5 rounded-full ${isLowBalance(token) ? 'bg-amber-500' : 'bg-amber-300'}`}
                                                                    style={{ width: `${getQuotaProgress(token.remaining_quota)}%` }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3 text-xs text-gray-500 dark:text-gray-400">
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div>
                                                                        <div className="text-[10px] uppercase text-gray-400">最后使用</div>
                                                                        <div className="text-gray-700 dark:text-gray-200">{formatDateTime(token.last_used_at)}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-[10px] uppercase text-gray-400">请求数</div>
                                                                        <div className="text-gray-700 dark:text-gray-200 tabular-nums">{token.total_requests}</div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="url"
                                                                        inputMode="url"
                                                                        value={baseUrlDraft}
                                                                        onChange={(e) =>
                                                                            setTokenBaseUrlDrafts((prev) => ({ ...prev, [token.id]: e.currentTarget.value }))
                                                                        }
                                                                        placeholder="默认"
                                                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs focus:ring-2 focus:ring-amber-500 outline-none transition"
                                                                    />
                                                                    {baseUrlDirty && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSaveTokenBaseUrl(token.id)}
                                                                            disabled={savingTokenUrl[token.id]}
                                                                            className="p-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40 transition disabled:opacity-50"
                                                                        >
                                                                            {savingTokenUrl[token.id] ? (
                                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                            ) : (
                                                                                <Check className="w-3.5 h-3.5" />
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleCheckQuota(token.id)}
                                                                            disabled={checkingQuotaTokenId === token.id}
                                                                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                                                                            title="刷新额度"
                                                                        >
                                                                            <RefreshCw className={`w-4 h-4 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleToggleToken(token.id, token.is_active)}
                                                                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                                                            title={token.is_active ? '停用' : '启用'}
                                                                        >
                                                                            <Power className={`w-4 h-4 ${token.is_active ? 'text-gray-500' : 'text-green-600'}`} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteToken(token.id)}
                                                                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                            title="删除"
                                                                        >
                                                                            <Trash2 className="w-4 h-4 text-red-500" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {sortedTokens.length === 0 && (
                                                <div className="py-12 text-center text-gray-400">
                                                    <Key className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                                    Token 池为空，请点击新增
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Model Pricing */}
                            {activeTab === 'pricing' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div className="bg-cream-50 dark:bg-cream-900/10 p-5 rounded-3xl border border-cream-200 dark:border-cream-900/20">
                                        <h4 className="text-xs font-bold text-cream-600 dark:text-cream-400 uppercase mb-3 px-1">新增模型计费</h4>
                                        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                                            <input
                                                type="text"
                                                value={newModelName}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewModelName(e.currentTarget.value)}
                                                placeholder="模型名称 (如 gemini-3-pro-image-preview)"
                                                className="flex-1 min-w-[200px] px-4 py-2.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-cream-500 outline-none transition-all placeholder:text-cream-300"
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                value={newModelCredits}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewModelCredits(Number(e.currentTarget.value))}
                                                placeholder="扣点次数"
                                                className="w-28 px-3 py-2.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm text-center focus:ring-2 focus:ring-cream-500 outline-none text-cream-700"
                                            />
                                            <button
                                                onClick={handleAddPricing}
                                                disabled={!newModelName.trim() || newModelCredits <= 0 || addingPricing}
                                                className="px-6 py-2.5 bg-cream-500 text-white rounded-2xl hover:bg-cream-600 disabled:opacity-50 transition-all font-bold text-sm shadow-md flex items-center gap-2"
                                            >
                                                {addingPricing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                                {addingPricing ? '添加中...' : '添加'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase px-1">模型计费列表 ({pricing.length})</h4>
                                        {pricing.map(item => (
                                            <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-gray-800 border border-cream-100 dark:border-gray-700 rounded-2xl gap-3 hover:shadow-md transition-shadow">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-cream-950 dark:text-cream-50 truncate">{item.model_name}</div>
                                                    <div className="text-[10px] text-cream-400 mt-1">更新于 {new Date(item.updated_at).toLocaleString()}</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={pricingDrafts[item.id] ?? item.credits_per_request}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                            const nextValue = Number(e.currentTarget.value);
                                                            setPricingDrafts(prev => ({ ...prev, [item.id]: nextValue }));
                                                        }}
                                                        className="w-24 px-3 py-2 rounded-xl border border-cream-200 dark:border-gray-700 dark:bg-gray-900 text-sm text-center focus:ring-2 focus:ring-cream-500 outline-none text-cream-700"
                                                    />
                                                    <span className="text-xs text-cream-400">次/次</span>
                                                    <button
                                                        onClick={() => handleUpdatePricing(item.id)}
                                                        disabled={savingPricing === item.id}
                                                        className="px-3 py-2 text-xs font-bold text-cream-600 bg-cream-100 dark:bg-cream-900/20 rounded-xl hover:bg-cream-200 dark:hover:bg-cream-900/30 transition flex items-center gap-1.5 disabled:opacity-50"
                                                    >
                                                        {savingPricing === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                                        {savingPricing === item.id ? '保存中...' : '保存'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {pricing.length === 0 && (
                                            <div className="text-center py-16 bg-gray-50 dark:bg-gray-800/20 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                                                <Coins className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                                                <p className="text-gray-400 text-sm">暂无计费配置，请在上方添加</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Redeem Codes */}
                            {activeTab === 'codes' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div className="bg-cream-50/50 dark:bg-amber-900/10 p-5 rounded-3xl border border-cream-200 dark:border-amber-900/20">
                                        <h4 className="text-xs font-bold text-cream-600 dark:text-cream-400 uppercase mb-4 px-1">批量生成兑换码</h4>
                                        <div className="flex gap-4 items-end flex-wrap sm:flex-nowrap">
                                            <div className="flex-1 min-w-[100px]">
                                                <label className="block text-[10px] font-bold text-cream-500 mb-1.5 ml-1">生成数量</label>
                                                <input
                                                    type="number"
                                                    value={generateCount}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGenerateCount(Number(e.currentTarget.value))}
                                                    className="w-full px-4 py-2.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm font-bold focus:ring-2 focus:ring-cream-500 outline-none text-cream-950 dark:text-cream-50"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-[100px]">
                                                <label className="block text-[10px] font-bold text-cream-500 mb-1.5 ml-1">面值 (次数)</label>
                                                <input
                                                    type="number"
                                                    value={generateAmount}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGenerateAmount(Number(e.currentTarget.value))}
                                                    className="w-full px-4 py-2.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm font-bold focus:ring-2 focus:ring-cream-500 outline-none text-cream-950 dark:text-cream-50"
                                                />
                                            </div>
                                            <button
                                                onClick={handleGenerateCodes}
                                                disabled={generatingCodes}
                                                className="px-8 py-2.5 bg-cream-500 text-white rounded-2xl hover:bg-cream-600 transition-all font-bold text-sm shadow-md h-[42px] hover:shadow-lg active:scale-95 flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {generatingCodes ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                                {generatingCodes ? '生成中...' : '一键生成'}
                                            </button>
                                        </div>
                                    </div>

                                    {generatedCodes.length > 0 && (
                                        <div className="p-6 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 rounded-3xl slide-in-bottom duration-300">
                                            <div className="flex justify-between items-center mb-4">
                                                <div className="flex items-center gap-2">
                                                    <Check className="w-5 h-5 text-green-500" />
                                                    <span className="font-bold text-green-700 dark:text-green-400">成功生成 {generatedCodes.length} 个兑换码</span>
                                                </div>
                                                <button onClick={handleCopyCodes} className="flex items-center gap-2 px-4 py-1.5 bg-white dark:bg-gray-800 text-xs font-bold text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-xl hover:bg-green-50 transition shadow-sm">
                                                    {copiedCodes ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                    {copiedCodes ? '已复制到剪贴板' : '复制全部代码'}
                                                </button>
                                            </div>
                                            <div className="bg-white/50 dark:bg-gray-900/50 p-4 rounded-2xl text-sm font-mono grid grid-cols-2 gap-2 text-green-800 dark:text-green-300 max-h-48 overflow-auto border border-green-50 dark:border-green-900/30">
                                                {generatedCodes.map(code => (
                                                    <div key={code} className="hover:bg-green-100 dark:hover:bg-green-900/40 p-1 rounded-lg text-center">{code}</div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-cream-100 dark:border-gray-800 overflow-hidden">
                                        <div className="px-5 py-4 border-b border-cream-100 dark:border-gray-800 bg-cream-50/50 dark:bg-gray-800/50">
                                            <h3 className="text-xs font-black text-cream-400 uppercase">历史兑换码记录 (最近20条)</h3>
                                        </div>
                                        <div className="divide-y divide-cream-50 dark:divide-gray-800">
                                            {codes.slice(0, 20).map(code => (
                                                <div key={code.id} className="flex items-center justify-between px-5 py-3 hover:bg-cream-50/50 transition">
                                                    <span className="font-mono text-sm font-medium text-cream-600 dark:text-cream-400">{code.code}</span>
                                                    <div className="flex items-center gap-6">
                                                        <span className="text-xs font-bold text-cream-500">{code.credit_amount} 次</span>
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cream-100 text-cream-600">P3:{code.pro3_credits}</span>
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">F:{code.flash_credits}</span>
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${code.is_used ? 'bg-cream-100 text-cream-400' : 'bg-green-100 text-green-600'}`}>
                                                            {code.is_used ? 'EXPIRED' : 'AVAILABLE'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {codes.length === 0 && (
                                            <div className="text-center py-10 text-gray-400 text-sm italic">暂无记录</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Users */}
                            {activeTab === 'users' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    {/* 统计概览卡片 */}
                                    {userStats && (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <StatCard label="总用户" value={userStats.total_users} />
                                            <StatCard label="今日新增" value={userStats.new_today} />
                                            <StatCard label="禁用用户" value={userStats.disabled_count} />
                                            <StatCard label="有余额用户" value={userStats.paid_users} />
                                        </div>
                                    )}

                                    {/* 搜索和筛选 */}
                                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                        {/* 搜索栏 */}
                                        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                                            <div className="flex items-center gap-3">
                                                <div className="relative flex-1">
                                                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        value={userSearch}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserSearch(e.currentTarget.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && loadData()}
                                                        placeholder="搜索邮箱或昵称..."
                                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => setShowFilters(!showFilters)}
                                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition ${showFilters ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                                                >
                                                    <Filter className="w-4 h-4" />
                                                    筛选
                                                </button>
                                                <button
                                                    onClick={handleExportUsers}
                                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    导出
                                                </button>
                                            </div>
                                        </div>

                                        {/* 高级筛选区 */}
                                        {showFilters && (
                                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 animate-in slide-in-from-top-2">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    {/* 角色筛选 */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">角色</label>
                                                        <select
                                                            value={userFilters.is_admin === undefined ? '' : String(userFilters.is_admin)}
                                                            onChange={(e) => setUserFilters(prev => ({ ...prev, is_admin: e.target.value === '' ? undefined : e.target.value === 'true' }))}
                                                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                        >
                                                            <option value="">全部</option>
                                                            <option value="false">普通用户</option>
                                                            <option value="true">管理员</option>
                                                        </select>
                                                    </div>

                                                    {/* 状态筛选 */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">状态</label>
                                                        <select
                                                            value={userFilters.is_active === undefined ? '' : String(userFilters.is_active)}
                                                            onChange={(e) => setUserFilters(prev => ({ ...prev, is_active: e.target.value === '' ? undefined : e.target.value === 'true' }))}
                                                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                        >
                                                            <option value="">全部</option>
                                                            <option value="true">已启用</option>
                                                            <option value="false">已禁用</option>
                                                        </select>
                                                    </div>

                                                    {/* 最小余额 */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">最小余额</label>
                                                        <input
                                                            type="number"
                                                            value={userFilters.min_balance ?? ''}
                                                            onChange={(e) => setUserFilters(prev => ({ ...prev, min_balance: e.target.value ? Number(e.target.value) : undefined }))}
                                                            placeholder="无限制"
                                                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                        />
                                                    </div>

                                                    {/* 最大余额 */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">最大余额</label>
                                                        <input
                                                            type="number"
                                                            value={userFilters.max_balance ?? ''}
                                                            onChange={(e) => setUserFilters(prev => ({ ...prev, max_balance: e.target.value ? Number(e.target.value) : undefined }))}
                                                            placeholder="无限制"
                                                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                        />
                                                    </div>

                                                    {/* 注册时间起 */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">注册时间起</label>
                                                        <input
                                                            type="date"
                                                            value={userFilters.created_after ?? ''}
                                                            onChange={(e) => setUserFilters(prev => ({ ...prev, created_after: e.target.value || undefined }))}
                                                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                        />
                                                    </div>

                                                    {/* 注册时间止 */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">注册时间止</label>
                                                        <input
                                                            type="date"
                                                            value={userFilters.created_before ?? ''}
                                                            onChange={(e) => setUserFilters(prev => ({ ...prev, created_before: e.target.value || undefined }))}
                                                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                        />
                                                    </div>

                                                    {/* 空占位 */}
                                                    <div className="hidden md:block"></div>

                                                    {/* 操作按钮 */}
                                                    <div className="flex items-end gap-2">
                                                        <button
                                                            onClick={handleResetFilters}
                                                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                                        >
                                                            重置
                                                        </button>
                                                        <button
                                                            onClick={handleApplyFilters}
                                                            className="flex-1 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition"
                                                        >
                                                            应用
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 批量操作栏 */}
                                        {selectedUserIds.size > 0 && (
                                            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/30 flex items-center justify-between animate-in slide-in-from-top-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                                        已选择 <strong>{selectedUserIds.size}</strong> 个用户
                                                    </span>
                                                    <button
                                                        onClick={handleSelectAll}
                                                        className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                                                    >
                                                        {selectedUserIds.size === users.length ? '取消全选' : '全选当前页'}
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => openBatchOperation('status')}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                                                    >
                                                        <Power className="w-3.5 h-3.5" />
                                                        批量启用/禁用
                                                    </button>
                                                    <button
                                                        onClick={() => openBatchOperation('credits')}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                                                    >
                                                        <Coins className="w-3.5 h-3.5" />
                                                        批量调整积分
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* 批量操作弹窗 */}
                                        {batchOperation && (
                                            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                                <div className="flex items-center gap-4">
                                                    {batchOperation === 'status' && (
                                                        <>
                                                            <span className="text-sm font-medium">批量设置状态：</span>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => setBatchStatus(true)}
                                                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${batchStatus === true ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                                                >
                                                                    启用
                                                                </button>
                                                                <button
                                                                    onClick={() => setBatchStatus(false)}
                                                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${batchStatus === false ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                                                >
                                                                    禁用
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                    {batchOperation === 'credits' && (
                                                        <>
                                                            <span className="text-sm font-medium">批量调整积分：</span>
                                                            <input
                                                                type="number"
                                                                value={batchAmount}
                                                                onChange={(e) => setBatchAmount(Number(e.target.value))}
                                                                placeholder="调整数量"
                                                                className="w-24 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm"
                                                            />
                                                        </>
                                                    )}
                                                    <input
                                                        type="text"
                                                        value={batchReason}
                                                        onChange={(e) => setBatchReason(e.target.value)}
                                                        placeholder="操作原因（必填）"
                                                        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                    />
                                                    <button
                                                        onClick={handleBatchOperation}
                                                        disabled={processingBatch || !batchReason.trim() || (batchOperation === 'status' && batchStatus === null) || (batchOperation === 'credits' && batchAmount === 0)}
                                                        className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50 flex items-center gap-2"
                                                    >
                                                        {processingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                                        确认
                                                    </button>
                                                    <button
                                                        onClick={() => setBatchOperation(null)}
                                                        className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* 用户表格 */}
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-10">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedUserIds.size === users.length && users.length > 0}
                                                                onChange={handleSelectAll}
                                                                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                                                            />
                                                        </th>
                                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">用户</th>
                                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">角色/状态</th>
                                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">余额</th>
                                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right hidden md:table-cell">消耗</th>
                                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">最近登录</th>
                                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">注册时间</th>
                                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">操作</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                    {users.map(u => (
                                                        <tr key={u.id} className={`group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${selectedUserIds.has(u.id) ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}>
                                                            <td className="px-4 py-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedUserIds.has(u.id)}
                                                                    onChange={() => handleSelectUser(u.id)}
                                                                    className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-600 dark:text-gray-400 text-sm shrink-0">
                                                                        {u.nickname?.[0] || u.email[0].toUpperCase()}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-medium text-gray-900 dark:text-white truncate">{u.nickname || '未设置昵称'}</span>
                                                                            {u.is_admin && <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-black">ADMIN</span>}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500 truncate">{u.email}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => handleSetUserStatus(u.id, !u.is_active)}
                                                                        className={`px-2 py-0.5 rounded text-xs font-medium transition ${u.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                                                    >
                                                                        {u.is_active ? '启用' : '禁用'}
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <span className={`font-bold ${u.credit_balance > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{u.credit_balance}</span>
                                                                    <button
                                                                        onClick={() => openCreditModal(u)}
                                                                        className="p-1 text-gray-400 hover:text-amber-500 rounded transition opacity-0 group-hover:opacity-100"
                                                                        title="调整余额"
                                                                    >
                                                                        <Coins className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-right hidden md:table-cell">
                                                                <span className="text-sm text-gray-600 dark:text-gray-400">{u.total_usage}</span>
                                                            </td>
                                                            <td className="px-4 py-3 hidden lg:table-cell">
                                                                <div className="text-xs text-gray-500">
                                                                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '-'}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 hidden lg:table-cell">
                                                                <div className="text-xs text-gray-500">
                                                                    {new Date(u.created_at).toLocaleDateString()}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button
                                                                        onClick={() => loadCreditHistory(u.id)}
                                                                        className={`p-1.5 rounded-lg transition ${creditHistoryUserId === u.id ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}
                                                                        title="积分历史"
                                                                    >
                                                                        <Clock className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingNoteUserId(u.id);
                                                                            setNoteContent(u.note || '');
                                                                        }}
                                                                        className={`p-1.5 rounded-lg transition ${editingNoteUserId === u.id ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}
                                                                        title="编辑备注"
                                                                    >
                                                                        <FileText className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {/* 积分历史展开行 */}
                                                    {creditHistory && creditHistoryUserId && users.find(u => u.id === creditHistoryUserId) && (
                                                        <tr key={`history-${creditHistoryUserId}`}>
                                                            <td colSpan={8} className="px-4 py-3 bg-amber-50 dark:bg-amber-900/10">
                                                                <div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">最近 3 条积分调整</div>
                                                                <div className="space-y-1">
                                                                    {creditHistory.items.length > 0 ? creditHistory.items.map(item => (
                                                                        <div key={item.id} className="flex items-center justify-between text-xs py-1 px-2 bg-white dark:bg-gray-800 rounded">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className={`${item.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                                                    {item.amount > 0 ? '+' : ''}{item.amount}
                                                                                </span>
                                                                                <span className="text-gray-500">{item.description || item.type}</span>
                                                                            </div>
                                                                            <span className="text-gray-400">
                                                                                {new Date(item.created_at).toLocaleString()} → 余额: {item.balance_after}
                                                                            </span>
                                                                        </div>
                                                                    )) : <div className="text-xs text-gray-400">暂无记录</div>}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {/* 备注编辑行 */}
                                                    {editingNoteUserId && users.find(u => u.id === editingNoteUserId) && (
                                                        <tr key={`note-${editingNoteUserId}`}>
                                                            <td colSpan={8} className="px-4 py-3 bg-amber-50 dark:bg-amber-900/10">
                                                                <div className="flex items-center gap-3">
                                                                    <input
                                                                        type="text"
                                                                        value={noteContent}
                                                                        onChange={(e) => setNoteContent(e.target.value)}
                                                                        placeholder="输入用户备注..."
                                                                        className="flex-1 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-900/30 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                                        autoFocus
                                                                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateNote(editingNoteUserId)}
                                                                    />
                                                                    <button
                                                                        onClick={() => handleUpdateNote(editingNoteUserId)}
                                                                        disabled={savingNote}
                                                                        className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50"
                                                                    >
                                                                        {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : '保存'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingNoteUserId(null);
                                                                            setNoteContent('');
                                                                        }}
                                                                        className="px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                                                    >
                                                                        取消
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* 分页控件 */}
                                        {usersTotal > userPageSize && (
                                            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                                <div className="text-sm text-gray-500">
                                                    共 <strong>{usersTotal}</strong> 个用户
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => { setUserPage(p => Math.max(1, p - 1)); setSelectedUserIds(new Set()); }}
                                                        disabled={userPage === 1}
                                                        className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                                    >
                                                        上一页
                                                    </button>
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                                        {userPage} / {Math.ceil(usersTotal / userPageSize)}
                                                    </span>
                                                    <button
                                                        onClick={() => { setUserPage(p => p + 1); setSelectedUserIds(new Set()); }}
                                                        disabled={userPage >= Math.ceil(usersTotal / userPageSize)}
                                                        className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                                    >
                                                        下一页
                                                    </button>
                                                    <select
                                                        value={userPageSize}
                                                        onChange={(e) => { setUserPageSize(Number(e.target.value)); setUserPage(1); }}
                                                        className="ml-2 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm"
                                                    >
                                                        <option value={10}>10条/页</option>
                                                        <option value={20}>20条/页</option>
                                                        <option value={50}>50条/页</option>
                                                        <option value={100}>100条/页</option>
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        {users.length === 0 && (
                                            <div className="text-center py-20 text-gray-400">
                                                <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                                <p className="text-sm">没有找到符合条件的用户</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Tickets */}
                            {activeTab === 'tickets' && (
                                <div className="flex h-[600px] border border-cream-200 dark:border-gray-700 rounded-3xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                                    {/* Ticket List */}
                                    <div className="w-1/3 border-r border-cream-200 dark:border-gray-700 flex flex-col">
                                        {/* Filters */}
                                        <div className="p-3 border-b border-cream-100 dark:border-gray-700 flex flex-col gap-2 bg-cream-50/30">
                                            {/* Status Filters */}
                                            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                                                {['all', 'open', 'pending', 'resolved', 'closed'].map(status => (
                                                    <button
                                                        key={status}
                                                        onClick={() => setTicketStatusFilter(status)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${ticketStatusFilter === status
                                                            ? 'bg-cream-600 text-white shadow-md'
                                                            : 'bg-cream-100 text-cream-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-cream-200'
                                                            }`}
                                                    >
                                                        {status === 'all' ? '全部' : TICKET_STATUS_LABELS[status as keyof typeof TICKET_STATUS_LABELS]?.label || status}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Category Filters */}
                                            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                                                <button
                                                    onClick={() => setTicketCategoryFilter('all')}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${ticketCategoryFilter === 'all'
                                                        ? 'bg-cream-200 text-cream-800 dark:bg-orange-900/30 dark:text-orange-300'
                                                        : 'bg-cream-50 text-cream-400 dark:bg-gray-800 dark:text-gray-400 hover:bg-cream-100'
                                                        }`}
                                                >
                                                    全部分类
                                                </button>
                                                {(Object.keys(TICKET_CATEGORIES) as TicketCategory[]).map(cat => (
                                                    <button
                                                        key={cat}
                                                        onClick={() => setTicketCategoryFilter(cat)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${ticketCategoryFilter === cat
                                                            ? 'bg-cream-200 text-cream-800 dark:bg-orange-900/30 dark:text-orange-300'
                                                            : 'bg-cream-50 text-cream-400 dark:bg-gray-800 dark:text-gray-400 hover:bg-cream-100'
                                                            }`}
                                                    >
                                                        {TICKET_CATEGORIES[cat].icon}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto bg-cream-50/30">
                                            {tickets.length === 0 ? (
                                                <div className="p-8 text-center text-cream-400 text-sm">没有工单</div>
                                            ) : tickets.map(t => (
                                                <div
                                                    key={t.id}
                                                    onClick={() => loadTicketDetail(t.id)}
                                                    className={`p-4 border-b border-cream-50 dark:border-gray-700/50 cursor-pointer hover:bg-cream-50 dark:hover:bg-gray-700/50 transition ${selectedTicket?.id === t.id ? 'bg-cream-100 dark:bg-gray-800 border-l-4 border-l-cream-600' : ''
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className={`font-medium text-sm line-clamp-1 ${t.status === 'closed' ? 'text-cream-400 line-through' : 'text-cream-950 dark:text-gray-200'}`}>
                                                            {t.title}
                                                        </h4>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${TICKET_STATUS_LABELS[t.status]?.color || 'bg-cream-100 text-cream-400'}`}>
                                                            {TICKET_STATUS_LABELS[t.status]?.label || t.status}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-cream-400 mt-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`px-1.5 py-0.5 rounded ${TICKET_CATEGORIES[t.category]?.color || 'bg-cream-100 text-cream-500'}`}>
                                                                {TICKET_CATEGORIES[t.category]?.icon}
                                                            </span>
                                                            <span>{t.user_email?.split('@')[0]}</span>
                                                        </div>
                                                        <span>{new Date(t.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Chat Area */}
                                    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900/50">
                                        {selectedTicket ? (
                                            <>
                                                <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shadow-sm z-10">
                                                    <div>
                                                        <h3 className="font-bold text-gray-900 dark:text-white">{selectedTicket.title}</h3>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-xs text-gray-500">用户: {selectedTicket.user_email}</span>
                                                            <span className={`text-xs px-1.5 py-0.5 rounded ${TICKET_CATEGORIES[selectedTicket.category]?.color || 'bg-gray-100 text-gray-500'}`}>
                                                                {TICKET_CATEGORIES[selectedTicket.category]?.icon} {TICKET_CATEGORIES[selectedTicket.category]?.label}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <select
                                                        value={selectedTicket.status}
                                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleUpdateTicketStatus(e.currentTarget.value)}
                                                        className="text-xs border-none bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-1 outline-none font-medium cursor-pointer"
                                                    >
                                                        <option value="open">待处理</option>
                                                        <option value="pending">待回复</option>
                                                        <option value="resolved">已解决</option>
                                                        <option value="closed">已关闭</option>
                                                    </select>
                                                </div>

                                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                                    {selectedTicket.messages?.map(msg => (
                                                        <div key={msg.id} className={`flex gap-3 ${msg.is_admin ? 'flex-row-reverse' : 'flex-row'}`}>
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.is_admin ? 'bg-cream-600 text-white' : 'bg-cream-100 text-cream-600'}`}>
                                                                {msg.is_admin ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                                            </div>
                                                            <div
                                                                className={`max-w-[80%] p-3.5 rounded-2xl text-sm ${msg.is_admin
                                                                    ? 'bg-cream-600 text-white rounded-tr-none shadow-[0_4px_12px_rgba(188,138,95,0.2)]'
                                                                    : 'bg-cream-50 text-cream-800 rounded-tl-none border border-cream-100'
                                                                    }`}
                                                            >
                                                                <div>{msg.content}</div>
                                                                <p className={`text-[10px] mt-1 opacity-70 ${msg.is_admin ? 'text-cream-100' : 'text-cream-400'}`}>
                                                                    {new Date(msg.created_at).toLocaleString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div ref={messagesEndRef} />
                                                </div>

                                                <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={adminReplyContent}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdminReplyContent(e.currentTarget.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleAdminReply()}
                                                            placeholder="作为管理员回复..."
                                                            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-2 focus:ring-cream-500 outline-none"
                                                        />
                                                        <button
                                                            onClick={handleAdminReply}
                                                            disabled={!adminReplyContent.trim()}
                                                            className="p-3 bg-cream-600 text-white rounded-xl hover:bg-cream-700 disabled:opacity-50 transition shadow-lg shadow-cream-600/20"
                                                        >
                                                            <Send className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                                <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
                                                <p>选择或点击左侧工单查看详情</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {isTokenDrawerOpen && (
                <div className="fixed inset-0 z-[60]">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setIsTokenDrawerOpen(false)}
                    />
                    <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">新增 Token</h3>
                            <button
                                type="button"
                                onClick={() => setIsTokenDrawerOpen(false)}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-500">名称</label>
                                <input
                                    type="text"
                                    value={newTokenName}
                                    onChange={(e) => setNewTokenName(e.currentTarget.value)}
                                    placeholder="名称 (如 Gemini-Pro-1)"
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-500">API Key</label>
                                <input
                                    type="text"
                                    inputMode="text"
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    spellCheck="false"
                                    value={newTokenKey}
                                    onChange={(e) => setNewTokenKey(e.currentTarget.value)}
                                    placeholder="API Key"
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none transition"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-500">Base URL (可选)</label>
                                <input
                                    type="url"
                                    inputMode="url"
                                    value={newTokenBaseUrl}
                                    onChange={(e) => setNewTokenBaseUrl(e.currentTarget.value)}
                                    placeholder="默认: https://nanobanana2.peacedejiai.cc/"
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs focus:ring-2 focus:ring-amber-500 outline-none transition"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-500">优先级</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    value={newTokenPriority}
                                    onChange={(e) => setNewTokenPriority(Number(e.currentTarget.value))}
                                    placeholder="优先级"
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                            <button
                                type="button"
                                onClick={handleAddToken}
                                disabled={!newTokenName || !newTokenKey || addingToken}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition"
                            >
                                {addingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {addingToken ? '添加中...' : '确认新增'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 批量操作二次确认 */}
            {batchConfirmOpen && pendingBatchPayload && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white">二次确认</h3>
                                <p className="text-xs text-gray-500">敏感操作需要管理员密码验证</p>
                            </div>
                            <button
                                onClick={closeBatchConfirm}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3 space-y-1">
                                <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                    {pendingBatchPayload.type === 'status'
                                        ? pendingBatchPayload.isActive
                                            ? '批量启用用户'
                                            : '批量禁用用户'
                                        : '批量调整积分'}
                                </div>
                                <div className="text-xs text-amber-700/80 dark:text-amber-200/80">
                                    影响用户数：{pendingBatchPayload.userIds.length}
                                </div>
                                {pendingBatchPayload.type === 'credits' && (
                                    <div className="text-xs text-amber-700/80 dark:text-amber-200/80">
                                        调整额度：{pendingBatchPayload.amount && pendingBatchPayload.amount > 0 ? '+' : ''}
                                        {pendingBatchPayload.amount}
                                    </div>
                                )}
                                <div className="text-xs text-amber-700/80 dark:text-amber-200/80">
                                    操作原因：{pendingBatchPayload.reason}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">管理员密码</label>
                                <input
                                    type="password"
                                    value={batchConfirmPassword}
                                    onChange={(e) => setBatchConfirmPassword(e.currentTarget.value)}
                                    placeholder="请输入管理员密码"
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition"
                                />
                            </div>

                            {batchConfirmError && (
                                <p className="text-xs text-red-500">{batchConfirmError}</p>
                            )}

                            <div className="flex items-center justify-end gap-2">
                                <button
                                    onClick={closeBatchConfirm}
                                    className="px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={executeBatchOperation}
                                    disabled={batchConfirming || !batchConfirmPassword.trim()}
                                    className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition disabled:opacity-60 flex items-center gap-2"
                                >
                                    {batchConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    确认并执行
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 余额调整弹窗 */}
            {creditModalOpen && creditModalUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-900 dark:text-white">调整用户积分</h3>
                            <button
                                onClick={() => setCreditModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            {/* 用户信息 */}
                            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center font-bold text-amber-600 dark:text-amber-400">
                                    {creditModalUser.nickname?.[0] || creditModalUser.email[0].toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-medium text-gray-900 dark:text-white">{creditModalUser.nickname || '未设置昵称'}</div>
                                    <div className="text-xs text-gray-500">{creditModalUser.email}</div>
                                </div>
                            </div>

                            {/* 当前余额 */}
                            <div className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                                <span className="text-sm text-gray-600 dark:text-gray-400">当前余额</span>
                                <span className="text-lg font-bold text-amber-500">{creditModalUser.credit_balance}</span>
                            </div>

                            {/* 调整模式选择 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">调整方式</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCreditModalMode('add')}
                                        className={`flex-1 py-2 px-4 rounded-xl font-medium transition ${creditModalMode === 'add' ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                    >
                                        + 增加
                                    </button>
                                    <button
                                        onClick={() => setCreditModalMode('subtract')}
                                        className={`flex-1 py-2 px-4 rounded-xl font-medium transition ${creditModalMode === 'subtract' ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                    >
                                        - 减少
                                    </button>
                                </div>
                            </div>

                            {/* 调整数量 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">调整数量</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min="1"
                                        value={adjustAmount}
                                        onChange={(e) => setAdjustAmount(Math.max(0, Number(e.target.value)))}
                                        className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 text-lg font-bold text-center focus:ring-2 focus:ring-amber-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* 变更预览 */}
                            {adjustAmount > 0 && (
                                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                                    <div className="text-xs text-gray-500 mb-1">变更预览</div>
                                    <div className="flex items-center justify-center gap-3 text-sm">
                                        <span className="font-medium">{creditModalUser.credit_balance}</span>
                                        <span className="text-gray-400">{creditModalMode === 'add' ? '→' : '→'}</span>
                                        <span className={`font-bold ${creditModalMode === 'add' ? 'text-green-500' : 'text-red-500'}`}>
                                            {creditModalMode === 'add'
                                                ? creditModalUser.credit_balance + adjustAmount
                                                : Math.max(0, creditModalUser.credit_balance - adjustAmount)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* 调整原因 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    调整原因 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={adjustReason}
                                    onChange={(e) => setAdjustReason(e.target.value)}
                                    placeholder="请输入调整原因（必填）"
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => setCreditModalOpen(false)}
                                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreditAdjust}
                                disabled={adjustingCredits || adjustAmount === 0 || !adjustReason.trim()}
                                className={`flex-1 px-4 py-2 rounded-xl font-medium text-white transition disabled:opacity-50 ${creditModalMode === 'add' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
                            >
                                {adjustingCredits ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null}
                                {adjustingCredits ? '处理中...' : `确认${creditModalMode === 'add' ? '增加' : '减少'} ${adjustAmount}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatCard = ({ label, value, onClick }: { label: string; value: number | string; onClick?: () => void }) => (
    <div
        onClick={onClick}
        className={`bg-white dark:bg-gray-800/80 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all ${onClick ? 'cursor-pointer hover:border-cream-300 dark:hover:border-cream-700 hover:bg-cream-50/50 dark:hover:bg-cream-900/10' : ''}`}
    >
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">{value}</p>
    </div>
);

interface TokenSummaryCardProps {
    label: string;
    value: number;
    tone: 'neutral' | 'ok' | 'warn' | 'low';
    helper?: string;
}

const TokenSummaryCard = ({ label, value, tone, helper }: TokenSummaryCardProps) => {
    const toneMap = {
        neutral: 'bg-gray-400',
        ok: 'bg-green-500',
        warn: 'bg-amber-500',
        low: 'bg-orange-500',
    };

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className={`h-2 w-2 rounded-full ${toneMap[tone]}`} />
                <span>{label}</span>
            </div>
            <div className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {value.toLocaleString()}
            </div>
            {helper && <div className="text-[10px] text-gray-400 mt-1">{helper}</div>}
        </div>
    );
};
