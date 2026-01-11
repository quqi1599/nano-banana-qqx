/**
 * 管理员专属全屏后台页面
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    X, Users, Key, Gift, BarChart3, Plus, Trash2, RefreshCw, Copy, Check, Loader2,
    ShieldCheck, MessageSquare, Send, UserCog, User, FileText, Image, Coins,
    TrendingUp, Activity, Home, LogOut, Menu, ChevronRight, Clock, Search,
    ArrowUpDown, ChevronDown, ChevronUp, Eye, EyeOff, Power
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import {
    getTokens, addToken, deleteToken, updateToken, TokenInfo,
    getModelPricing, createModelPricing, updateModelPricing, ModelPricingInfo,
    generateRedeemCodes, getRedeemCodes, RedeemCodeInfo,
    getUsers, adjustUserCredits, updateUserNote, AdminUser,
    getDashboardStats, DashboardStats, checkTokenQuota,
} from '../services/adminService';
import { formatBalance } from '../services/balanceService';
import { getApiBaseUrl } from '../utils/endpointUtils';
import { getAllTickets, getTicketDetail, replyTicket, updateTicketStatus, Ticket, TicketMessage } from '../services/ticketService';
import {
    adminGetConversations,
    adminGetConversation,
    adminDeleteConversation,
    AdminConversation,
    AdminConversationDetail,
    ConversationMessage,
} from '../services/conversationService';

interface AdminDashboardProps {
    onLogout: () => void;
}

type TabType = 'dashboard' | 'tokens' | 'pricing' | 'codes' | 'users' | 'tickets' | 'conversations';
type SortKey = 'priority' | 'remaining_quota' | 'last_used_at';

export const AdminDashboard = ({ onLogout }: AdminDashboardProps) => {
    const { user, logout } = useAuthStore();
    const { settings } = useAppStore();
    const apiBaseUrl = getApiBaseUrl(settings.customEndpoint);
    const [activeTab, setActiveTab] = useState<TabType>('dashboard');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Dashboard
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [modelStatsLoaded, setModelStatsLoaded] = useState(false);
    const [dailyStatsLoaded, setDailyStatsLoaded] = useState(false);
    const [modelStatsLoading, setModelStatsLoading] = useState(false);
    const [dailyStatsLoading, setDailyStatsLoading] = useState(false);

    // Tokens
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenKey, setNewTokenKey] = useState('');
    const [newTokenBaseUrl, setNewTokenBaseUrl] = useState('');
    const [newTokenPriority, setNewTokenPriority] = useState(0);
    const [tokenBaseUrlDrafts, setTokenBaseUrlDrafts] = useState<Record<string, string>>({});
    const [checkingQuotaTokenId, setCheckingQuotaTokenId] = useState<string | null>(null);
    const [addingToken, setAddingToken] = useState(false);
    const [savingTokenUrl, setSavingTokenUrl] = useState<Record<string, boolean>>({});
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
    const [generateAmount, setGenerateAmount] = useState(100);
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
    const [copiedCodes, setCopiedCodes] = useState(false);

    // Users
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [adjustAmount, setAdjustAmount] = useState(0);
    const [editingNoteUserId, setEditingNoteUserId] = useState<string | null>(null);
    const [noteContent, setNoteContent] = useState('');

    // Tickets
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [adminReplyContent, setAdminReplyContent] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Conversations
    const [conversations, setConversations] = useState<AdminConversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<AdminConversationDetail | null>(null);
    const [conversationSearch, setConversationSearch] = useState('');

    const loadData = async () => {
        setIsLoading(true);
        setError('');
        try {
            if (activeTab === 'dashboard') {
                const data = await getDashboardStats(undefined, undefined, {
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
                const data = await getUsers(1, userSearch);
                setUsers(data.users);
            } else if (activeTab === 'tickets') {
                const data = await getAllTickets(ticketStatusFilter);
                setTickets(data);
            } else if (activeTab === 'conversations') {
                const data = await adminGetConversations(undefined, conversationSearch);
                setConversations(data);
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
            const data = await getDashboardStats(undefined, undefined, {
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
            const data = await getDashboardStats(undefined, undefined, {
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
    }, [ticketStatusFilter]);

    useEffect(() => {
        if (activeTab === 'conversations') {
            loadData();
        }
    }, [activeTab, conversationSearch]);

    useEffect(() => {
        if (selectedTicket && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedTicket?.messages]);

    useEffect(() => {
        if (activeTab === 'conversations') {
            return;
        }
        loadData();
    }, [activeTab]);

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
            loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setAddingToken(false);
        }
    };

    const handleToggleToken = async (id: string, currentStatus: boolean) => {
        try {
            await updateToken(id, { is_active: !currentStatus });
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleDeleteToken = async (id: string) => {
        if (!confirm('确定要删除这个 Token 吗？')) return;
        try {
            await deleteToken(id);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleCheckQuota = async (id: string) => {
        setCheckingQuotaTokenId(id);
        try {
            const baseUrl = tokenBaseUrlDrafts[id]?.trim() || apiBaseUrl;
            const updated = await checkTokenQuota(id, baseUrl);
            setTokens(prev => prev.map(t => t.id === id ? { ...t, remaining_quota: updated.remaining_quota } : t));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCheckingQuotaTokenId(null);
        }
    };

    const handleSaveTokenBaseUrl = async (id: string) => {
        const baseUrl = tokenBaseUrlDrafts[id]?.trim() || null;
        const current = tokens.find(t => t.id === id)?.base_url || null;
        if ((current || null) === baseUrl) return;
        setSavingTokenUrl((prev) => ({ ...prev, [id]: true }));
        try {
            const updated = await updateToken(id, { base_url: baseUrl });
            setTokens(prev => prev.map(t => t.id === id ? { ...t, base_url: updated.base_url } : t));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSavingTokenUrl((prev) => ({ ...prev, [id]: false }));
        }
    };

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
            setError('复制失败，请手动复制');
        }
    };

    const handleRevealTokenKey = (tokenId: string) => {
        const secret = tokenSecrets[tokenId];
        if (!secret) {
            setError('完整 Key 仅创建时可见');
            return;
        }
        if (!confirm('将在短时间内显示完整 Key，确认继续？')) return;
        setRevealedTokenIds((prev) => ({ ...prev, [tokenId]: true }));
        setTimeout(
            () => setRevealedTokenIds((prev) => ({ ...prev, [tokenId]: false })),
            10000
        );
    };

    const handleAddPricing = async () => {
        if (!newModelName.trim() || newModelCredits <= 0) return;
        try {
            await createModelPricing(newModelName.trim(), newModelCredits);
            setNewModelName('');
            setNewModelCredits(10);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleUpdatePricing = async (id: string) => {
        const nextValue = pricingDrafts[id];
        if (!nextValue || nextValue <= 0) {
            setError('扣点次数必须大于 0');
            return;
        }
        try {
            await updateModelPricing(id, nextValue);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleAdjustCredits = async (userId: string) => {
        if (adjustAmount === 0) return;
        try {
            await adjustUserCredits(userId, adjustAmount, '管理员手动调整');
            setEditingUserId(null);
            setAdjustAmount(0);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleUpdateNote = async (userId: string) => {
        try {
            await updateUserNote(userId, noteContent);
            setEditingNoteUserId(null);
            setNoteContent('');
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleGenerateCodes = async () => {
        try {
            const result = await generateRedeemCodes(generateCount, generateAmount, 0, 0);
            setGeneratedCodes(result.codes);
            loadData();
        } catch (err) {
            setError((err as Error).message);
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
            setError((err as Error).message);
        }
    };

    const handleAdminReply = async () => {
        if (!selectedTicket || !adminReplyContent.trim()) return;
        try {
            await replyTicket(selectedTicket.id, adminReplyContent);
            setAdminReplyContent('');
            await loadTicketDetail(selectedTicket.id);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleUpdateTicketStatus = async (status: string) => {
        if (!selectedTicket) return;
        try {
            setSelectedTicket({ ...selectedTicket, status: status as any });
            await updateTicketStatus(selectedTicket.id, status);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleLogout = () => {
        logout();
        onLogout();
    };

    const loadConversationDetail = async (id: string) => {
        try {
            const data = await adminGetConversation(id);
            setSelectedConversation(data);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const menuItems = [
        { id: 'dashboard', label: '仪表盘', icon: Home },
        { id: 'tokens', label: 'Token池', icon: Key },
        { id: 'pricing', label: '计费设置', icon: Coins },
        { id: 'codes', label: '兑换码', icon: Gift },
        { id: 'users', label: '用户管理', icon: Users },
        { id: 'tickets', label: '工单系统', icon: MessageSquare },
        { id: 'conversations', label: '对话历史', icon: MessageSquare },
    ] as const;

    return (
        <div className="flex h-screen w-full bg-gray-100 dark:bg-gray-950">
            {/* Mobile Sidebar Backdrop */}
            {!sidebarCollapsed && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
                    onClick={() => setSidebarCollapsed(true)}
                />
            )}

            {/* Mobile Bottom Navigation */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 safe-area-bottom">
                <div className="flex items-center justify-around py-1">
                    {menuItems.map(item => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setActiveTab(item.id);
                                    setError('');
                                    setGeneratedCodes([]);
                                    setSelectedTicket(null);
                                    setSelectedConversation(null);
                                }}
                                className={`flex flex-col items-center justify-center py-2 px-3 min-w-0 flex-1 transition-all duration-200 ${isActive
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-gray-400 dark:text-gray-500'
                                    }`}
                            >
                                <div className={`relative p-1.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                                    <item.icon className="w-5 h-5" />
                                    {isActive && (
                                        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-500 rounded-full" />
                                    )}
                                </div>
                                <span className={`text-[10px] font-medium mt-1 truncate w-full text-center ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* Sidebar */}
            <aside className={`
                fixed lg:relative z-50 h-full
                ${sidebarCollapsed ? 'w-0 lg:w-20 -translate-x-full lg:translate-x-0' : 'w-72 lg:w-64 translate-x-0'} 
                flex-shrink-0 bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 text-white 
                transition-all duration-300 flex flex-col overflow-hidden
            `}>
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
                    {!sidebarCollapsed && (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                                <ShieldCheck className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="font-bold text-lg">管理后台</h1>
                                <p className="text-xs text-gray-400">Admin Panel</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="p-2 rounded-lg hover:bg-white/10 transition"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                </div>

                {/* Menu Items */}
                <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => {
                                setActiveTab(item.id);
                                setError('');
                                setGeneratedCodes([]);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activeTab === item.id
                                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/30'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            <item.icon className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : ''}`} />
                            {!sidebarCollapsed && (
                                <>
                                    <span className="font-medium">{item.label}</span>
                                    {activeTab === item.id && (
                                        <ChevronRight className="w-4 h-4 ml-auto" />
                                    )}
                                </>
                            )}
                        </button>
                    ))}
                </nav>

                {/* User Info & Logout */}
                <div className="p-4 border-t border-white/10">
                    {!sidebarCollapsed && (
                        <div className="mb-4 p-3 bg-white/5 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center font-bold text-white shadow-lg">
                                    {user?.nickname?.[0] || user?.email?.[0]?.toUpperCase() || 'A'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-white truncate">{user?.nickname || '管理员'}</p>
                                    <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                                </div>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition font-medium ${sidebarCollapsed ? 'px-3' : ''}`}
                    >
                        <LogOut className="w-5 h-5" />
                        {!sidebarCollapsed && <span>退出登录</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Top Bar */}
                <header className="h-14 lg:h-16 flex items-center justify-between px-3 lg:px-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
                    <div className="flex items-center gap-2 lg:gap-3">
                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                            <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                        </button>
                        <h2 className="text-base lg:text-xl font-bold text-gray-900 dark:text-white">
                            {menuItems.find(m => m.id === activeTab)?.label || '仪表盘'}
                        </h2>
                    </div>
                    <button
                        onClick={loadData}
                        className={`flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition font-medium text-xs lg:text-sm ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`w-3.5 lg:w-4 h-3.5 lg:h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">刷新</span>
                        <span className="sm:hidden">刷新</span>
                    </button>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-auto p-3 lg:p-6 pb-20 lg:pb-6">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3">
                            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></span>
                            {error}
                        </div>
                    )}

                    {isLoading && !stats && !tokens.length && !pricing.length && !codes.length && !users.length && !tickets.length ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-4">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full border-4 border-amber-200 dark:border-amber-900"></div>
                                <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-amber-500 border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-gray-500 font-medium">正在加载数据...</p>
                        </div>
                    ) : (
                        <>
                            {/* Dashboard */}
                            {activeTab === 'dashboard' && stats && (
                                <div className="space-y-4 lg:space-y-6 animate-in fade-in duration-300">
                                    {/* Stats Cards - Mobile Horizontal Scroll */}
                                    <div className="lg:grid lg:grid-cols-4 gap-3 lg:gap-4 flex overflow-x-auto snap-x snap-mandatory pb-2 -mx-3 px-3 lg:mx-0 lg:px-0 scrollbar-hide">
                                        <div className="snap-start shrink-0 w-[85%] sm:w-[60%] lg:w-auto">
                                            <StatCard
                                                label="今日消耗"
                                                value={stats.today_credits_used}
                                                suffix="次"
                                                icon={Coins}
                                                color="amber"
                                            />
                                        </div>
                                        <div className="snap-start shrink-0 w-[85%] sm:w-[60%] lg:w-auto">
                                            <StatCard
                                                label="图片生成"
                                                value={stats.today_image_calls}
                                                suffix="次"
                                                icon={Image}
                                                color="orange"
                                            />
                                        </div>
                                        <div className="snap-start shrink-0 w-[85%] sm:w-[60%] lg:w-auto">
                                            <StatCard
                                                label="今日活跃"
                                                value={stats.active_users_today}
                                                suffix="人"
                                                icon={Users}
                                                color="blue"
                                            />
                                        </div>
                                        <div className="snap-start shrink-0 w-[85%] sm:w-[60%] lg:w-auto">
                                            <StatCard
                                                label="请求总数"
                                                value={stats.total_requests_today}
                                                suffix="次"
                                                icon={Activity}
                                                color="green"
                                            />
                                        </div>
                                    </div>

                                    {/* Secondary Stats - Mobile Horizontal Scroll */}
                                    <div className="lg:grid lg:grid-cols-4 gap-2 lg:gap-4 flex overflow-x-auto snap-x snap-mandatory pb-2 -mx-3 px-3 lg:mx-0 lg:px-0 scrollbar-hide">
                                        <div className="snap-start shrink-0 w-[45%] lg:w-auto bg-white dark:bg-gray-900 rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-gray-100 dark:border-gray-800">
                                            <p className="text-[10px] lg:text-xs text-gray-500 mb-1">总用户数</p>
                                            <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{stats.total_users}</p>
                                        </div>
                                        <div className="snap-start shrink-0 w-[45%] lg:w-auto bg-white dark:bg-gray-900 rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-gray-100 dark:border-gray-800">
                                            <p className="text-[10px] lg:text-xs text-gray-500 mb-1">总消耗</p>
                                            <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{stats.total_credits_consumed.toLocaleString()}</p>
                                        </div>
                                        <div className="snap-start shrink-0 w-[45%] lg:w-auto bg-white dark:bg-gray-900 rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-gray-100 dark:border-gray-800">
                                            <p className="text-[10px] lg:text-xs text-gray-500 mb-1">Token池</p>
                                            <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{stats.available_tokens}/{stats.token_pool_count}</p>
                                        </div>
                                        <div className="snap-start shrink-0 w-[45%] lg:w-auto bg-white dark:bg-gray-900 rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-gray-100 dark:border-gray-800">
                                            <p className="text-[10px] lg:text-xs text-gray-500 mb-1">可用</p>
                                            <p className="text-xl lg:text-2xl font-bold text-green-600">{stats.available_tokens}</p>
                                        </div>
                                    </div>

                                    {/* Charts Section */}
                                    <div className="grid lg:grid-cols-2 gap-6">
                                        {/* Model Usage */}
                                        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                                            <h3 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                                                <BarChart3 className="w-5 h-5 text-amber-500" />
                                                模型使用占比
                                            </h3>
                                            {modelStatsLoaded ? (
                                                stats.model_stats.length > 0 ? (
                                                    <div className="space-y-4">
                                                        {stats.model_stats.map((m, idx) => {
                                                            const colors = ['bg-amber-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500'];
                                                            return (
                                                                <div key={m.model_name}>
                                                                    <div className="flex justify-between text-sm mb-2">
                                                                        <span className="font-medium text-gray-700 dark:text-gray-300">{m.model_name}</span>
                                                                        <span className="text-gray-500">{m.total_requests} 次 / {m.total_credits_used} 次</span>
                                                                    </div>
                                                                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full ${colors[idx % colors.length]} transition-all duration-500`}
                                                                            style={{ width: `${Math.min(100, (m.total_requests / Math.max(1, stats.total_requests_today)) * 100)}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-12 text-gray-400">
                                                        <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                        <p>今日暂无使用记录</p>
                                                    </div>
                                                )
                                            ) : (
                                                <div className="text-center py-10 text-gray-400">
                                                    <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                                    <button
                                                        type="button"
                                                        onClick={loadModelStats}
                                                        disabled={modelStatsLoading}
                                                        className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                                                    >
                                                        {modelStatsLoading ? '加载中...' : '加载模型统计'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Daily Trend */}
                                        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                                            <h3 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                                                <TrendingUp className="w-5 h-5 text-green-500" />
                                                近7天趋势
                                            </h3>
                                            {dailyStatsLoaded ? (
                                                stats.daily_stats.length > 0 ? (
                                                    <div className="space-y-3">
                                                        {stats.daily_stats.map(day => (
                                                            <div key={day.date} className="flex items-center gap-4">
                                                                <span className="w-20 text-sm text-gray-500 font-mono">{day.date.slice(5)}</span>
                                                                <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative">
                                                                    <div
                                                                        className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                                                                        style={{ width: `${Math.min(100, (day.total_requests / Math.max(1, ...stats.daily_stats.map(d => d.total_requests))) * 100)}%` }}
                                                                    />
                                                                </div>
                                                                <span className="w-16 text-right text-sm font-medium text-gray-600 dark:text-gray-400">{day.total_requests}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-12 text-gray-400">
                                                        <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                        <p>暂无历史数据</p>
                                                    </div>
                                                )
                                            ) : (
                                                <div className="text-center py-10 text-gray-400">
                                                    <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                                    <button
                                                        type="button"
                                                        onClick={loadDailyStats}
                                                        disabled={dailyStatsLoading}
                                                        className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                                                    >
                                                        {dailyStatsLoading ? '加载中...' : '加载近7天统计'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tokens */}
                            {activeTab === 'tokens' && (
                                <div className="space-y-4 lg:space-y-6 animate-in fade-in duration-300">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h3 className="text-base lg:text-lg font-bold text-gray-900 dark:text-white">Token 池</h3>
                                            <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                                                统一查看状态、额度与使用情况
                                            </p>
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

                                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                                        <div className="hidden md:block">
                                            <div className="overflow-auto max-h-[60vh]">
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
                                                                            <span className="font-mono truncate max-w-[160px]">{displayKey}</span>
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
                                                                                className="w-full min-w-[180px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs focus:ring-2 focus:ring-amber-500 outline-none transition"
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
                                                                    暂无 Token，请点击右上角新增
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
                                                    暂无 Token，请点击新增
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Model Pricing */}
                            {activeTab === 'pricing' && (
                                <div className="space-y-4 lg:space-y-6 animate-in fade-in duration-300">
                                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 lg:p-6 rounded-xl lg:rounded-2xl border border-amber-100 dark:border-amber-900/30">
                                        <h4 className="font-bold text-amber-600 dark:text-amber-400 mb-3 lg:mb-4 flex items-center gap-2 text-sm lg:text-base">
                                            <Coins className="w-4 h-4 lg:w-5 lg:h-5" />
                                            新增模型计费
                                        </h4>
                                        <div className="flex flex-col sm:flex-row gap-2 lg:gap-3">
                                            <input
                                                type="text"
                                                value={newModelName}
                                                onChange={(e) => setNewModelName(e.currentTarget.value)}
                                                placeholder="模型名称 (如 gemini-3-pro-image-preview)"
                                                className="flex-1 min-w-0 px-4 py-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-amber-500 outline-none transition text-sm lg:text-base"
                                            />
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min="1"
                                                value={newModelCredits}
                                                onChange={(e) => setNewModelCredits(Number(e.currentTarget.value))}
                                                placeholder="扣点"
                                                className="w-24 lg:w-28 px-4 py-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-center focus:ring-2 focus:ring-amber-500 outline-none transition text-sm lg:text-base"
                                            />
                                            <button
                                                onClick={handleAddPricing}
                                                disabled={!newModelName.trim() || newModelCredits <= 0}
                                                className="w-full sm:w-auto px-6 lg:px-8 py-3 min-h-[48px] bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 transition font-bold shadow-lg shadow-amber-500/30 text-sm lg:text-base"
                                            >
                                                添加
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 lg:space-y-3">
                                        <h4 className="font-bold text-gray-400 uppercase text-xs lg:text-sm tracking-wider">模型计费列表 ({pricing.length})</h4>
                                        {pricing.map(item => (
                                            <div key={item.id} className="bg-white dark:bg-gray-900 rounded-xl lg:rounded-2xl p-3 lg:p-5 border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-shadow">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-gray-900 dark:text-white truncate text-sm lg:text-base">{item.model_name}</div>
                                                        <div className="text-[10px] lg:text-xs text-gray-400 mt-0.5">更新于 {new Date(item.updated_at).toLocaleString()}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                                                        <div className="flex items-center gap-2 flex-1 sm:flex-none">
                                                            <input
                                                                type="number"
                                                                inputMode="numeric"
                                                                min="1"
                                                                value={pricingDrafts[item.id] ?? item.credits_per_request}
                                                                onChange={(e) => {
                                                                    const nextValue = Number(e.currentTarget.value);
                                                                    setPricingDrafts(prev => ({ ...prev, [item.id]: nextValue }));
                                                                }}
                                                                className="w-24 sm:w-20 lg:w-24 px-3 py-2 min-h-[44px] rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm text-center focus:ring-2 focus:ring-amber-500 outline-none"
                                                            />
                                                            <span className="text-xs text-gray-400">次</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleUpdatePricing(item.id)}
                                                            className="px-4 py-2 text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition min-h-[44px] flex-1 sm:flex-none"
                                                        >
                                                            保存
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {pricing.length === 0 && (
                                            <div className="text-center py-20 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800">
                                                <Coins className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                                                <p className="text-gray-400">暂无计费配置，请在上方添加</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Redeem Codes */}
                            {activeTab === 'codes' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                                        <h4 className="font-bold text-amber-600 dark:text-amber-400 mb-4 flex items-center gap-2">
                                            <Gift className="w-5 h-5" />
                                            批量生成兑换码
                                        </h4>
                                        <div className="flex gap-4 items-end flex-wrap lg:flex-nowrap">
                                            <div className="flex-1 min-w-[140px]">
                                                <label className="block text-xs font-bold text-amber-600 mb-2">生成数量</label>
                                                <input
                                                    type="number"
                                                    value={generateCount}
                                                    onChange={(e) => setGenerateCount(Number(e.currentTarget.value))}
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-[140px]">
                                                <label className="block text-xs font-bold text-amber-600 mb-2">面值 (次数)</label>
                                                <input
                                                    type="number"
                                                    value={generateAmount}
                                                    onChange={(e) => setGenerateAmount(Number(e.currentTarget.value))}
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                                                />
                                            </div>
                                            <button
                                                onClick={handleGenerateCodes}
                                                className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition font-bold shadow-lg shadow-amber-500/30"
                                            >
                                                一键生成
                                            </button>
                                        </div>
                                    </div>

                                    {generatedCodes.length > 0 && (
                                        <div className="p-6 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/20 rounded-2xl">
                                            <div className="flex justify-between items-center mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                                        <Check className="w-6 h-6 text-green-600" />
                                                    </div>
                                                    <span className="font-bold text-green-700 dark:text-green-400">
                                                        成功生成 {generatedCodes.length} 个兑换码
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={handleCopyCodes}
                                                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-green-600 border border-green-200 dark:border-green-800 rounded-xl hover:bg-green-50 transition font-medium"
                                                >
                                                    {copiedCodes ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                    {copiedCodes ? '已复制' : '复制全部'}
                                                </button>
                                            </div>
                                            <div className="bg-white dark:bg-gray-900 p-4 rounded-xl font-mono text-sm grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-auto border border-green-100 dark:border-green-900/30">
                                                {generatedCodes.map(code => (
                                                    <div key={code} className="text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 p-2 rounded text-center transition">
                                                        {code}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                            <h3 className="font-bold text-gray-400 uppercase text-sm tracking-wider">历史兑换码 (最近20条)</h3>
                                        </div>
                                        <div className="divide-y divide-gray-50 dark:divide-gray-800">
                                            {codes.slice(0, 20).map(code => (
                                                <div key={code.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                                    <span className="font-mono font-medium text-gray-600 dark:text-gray-400">{code.code}</span>
                                                    <div className="flex items-center gap-8">
                                                        <span className="font-bold text-gray-500">{code.credit_amount} 次</span>
                                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${code.is_used ? 'bg-gray-100 text-gray-400' : 'bg-green-100 text-green-600'}`}>
                                                            {code.is_used ? '已使用' : '可用'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {codes.length === 0 && (
                                            <div className="text-center py-16 text-gray-400">
                                                <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                暂无记录
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Users */}
                            {activeTab === 'users' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div className="relative">
                                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.currentTarget.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && loadData()}
                                            placeholder="按邮箱或昵称搜索用户..."
                                            className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-2 focus:ring-amber-500 outline-none transition text-lg"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="font-bold text-gray-400 uppercase text-sm tracking-wider">用户列表 ({users.length})</h4>
                                        {users.map(u => (
                                            <div key={u.id} className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-shadow">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-yellow-400 flex items-center justify-center font-bold text-white text-lg shadow-lg">
                                                            {u.nickname?.[0] || u.email[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-gray-900 dark:text-white">{u.nickname || '未设置昵称'}</span>
                                                                {u.is_admin && (
                                                                    <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-bold">ADMIN</span>
                                                                )}
                                                            </div>
                                                            <div className="text-sm text-gray-400">{u.email}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-8">
                                                        <div className="text-right hidden lg:block">
                                                            <div className="text-xs text-gray-400 uppercase font-bold">最后登录</div>
                                                            <div className="text-sm font-mono text-gray-600 dark:text-gray-400">
                                                                {u.last_login_at ? new Date(u.last_login_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                            </div>
                                                            <div className="text-xs font-mono text-gray-400">{u.last_login_ip || '-'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-gray-400 uppercase font-bold">剩余次数</div>
                                                            <div className="text-2xl font-black text-amber-600">{u.credit_balance}</div>
                                                        </div>
                                                        <div className="text-right hidden sm:block">
                                                            <div className="text-xs text-gray-400 uppercase font-bold">消耗次数</div>
                                                            <div className="text-2xl font-black text-gray-700 dark:text-gray-300">{u.total_usage}</div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingNoteUserId(editingNoteUserId === u.id ? null : u.id);
                                                                    setNoteContent(u.note || '');
                                                                    setEditingUserId(null);
                                                                }}
                                                                className={`p-3 rounded-xl transition ${editingNoteUserId === u.id ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-amber-100 hover:text-amber-500'}`}
                                                                title="编辑备注"
                                                            >
                                                                <FileText className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingUserId(editingUserId === u.id ? null : u.id);
                                                                    setAdjustAmount(0);
                                                                    setEditingNoteUserId(null);
                                                                }}
                                                                className={`p-3 rounded-xl transition ${editingUserId === u.id ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-amber-600 hover:bg-amber-100'}`}
                                                                title="调整次数"
                                                            >
                                                                <UserCog className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {u.note && !editingNoteUserId && (
                                                    <div className="mt-4 text-sm bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-400 p-3 rounded-xl border border-amber-100 dark:border-amber-900/20 flex items-start gap-2">
                                                        <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                        <span>{u.note}</span>
                                                    </div>
                                                )}

                                                {editingUserId === u.id && (
                                                    <div className="mt-4 p-5 bg-amber-50 dark:bg-amber-900/10 rounded-xl">
                                                        <p className="text-xs font-bold text-amber-600 mb-3 uppercase">调整剩余次数</p>
                                                        <div className="flex gap-3">
                                                            <input
                                                                type="number"
                                                                value={adjustAmount}
                                                                onChange={(e) => setAdjustAmount(Number(e.currentTarget.value))}
                                                                placeholder="数量 (正加负减)"
                                                                className="flex-1 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-900/30 dark:bg-gray-800 font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                                                            />
                                                            <button
                                                                onClick={() => handleAdjustCredits(u.id)}
                                                                className="px-8 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition shadow-lg shadow-amber-500/30"
                                                            >
                                                                保存修改
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {editingNoteUserId === u.id && (
                                                    <div className="mt-4 p-5 bg-amber-50 dark:bg-amber-900/10 rounded-xl">
                                                        <p className="text-xs font-bold text-amber-600 mb-3 uppercase">编辑备注</p>
                                                        <div className="flex gap-3">
                                                            <input
                                                                type="text"
                                                                value={noteContent}
                                                                onChange={(e) => setNoteContent(e.currentTarget.value)}
                                                                placeholder="输入用户备注信息..."
                                                                className="flex-1 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-900/30 dark:bg-gray-800 focus:ring-2 focus:ring-amber-500 outline-none"
                                                            />
                                                            <button
                                                                onClick={() => handleUpdateNote(u.id)}
                                                                className="px-8 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition shadow-lg shadow-amber-500/30"
                                                            >
                                                                保存备注
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {users.length === 0 && (
                                            <div className="text-center py-20 text-gray-400">
                                                <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                                没有找到符合条件的用户
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Tickets */}
                            {activeTab === 'tickets' && (
                                <div className="flex flex-col lg:flex-row h-[calc(100vh-200px)] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                                    {/* Ticket List */}
                                    <div className={`${selectedTicket ? 'hidden lg:flex' : 'flex'} lg:w-1/3 w-full border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-800 flex-col ${!selectedTicket ? 'flex-1' : ''}`}>
                                        <div className="p-3 lg:p-4 border-b border-gray-100 dark:border-gray-800 flex gap-2 overflow-x-auto bg-gray-50 dark:bg-gray-800/50">
                                            {['all', 'open', 'pending', 'resolved', 'closed'].map(status => (
                                                <button
                                                    key={status}
                                                    onClick={() => setTicketStatusFilter(status)}
                                                    className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${ticketStatusFilter === status
                                                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/30'
                                                        : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                        }`}
                                                >
                                                    {status === 'all' ? '全部' : status === 'open' ? '待处理' : status === 'pending' ? '待回复' : status === 'resolved' ? '已解决' : '已关闭'}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            {tickets.length === 0 ? (
                                                <div className="p-12 text-center text-gray-400">
                                                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                    没有工单
                                                </div>
                                            ) : tickets.map(t => (
                                                <div
                                                    key={t.id}
                                                    onClick={() => loadTicketDetail(t.id)}
                                                    className={`p-5 border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${selectedTicket?.id === t.id ? 'bg-amber-50 dark:bg-amber-900/10 border-l-4 border-l-amber-500' : ''
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className={`font-medium line-clamp-1 ${t.status === 'closed' ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                                                            {t.title}
                                                        </h4>
                                                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${t.status === 'open' ? 'bg-green-100 text-green-600' :
                                                            t.status === 'pending' ? 'bg-amber-100 text-amber-600' :
                                                                t.status === 'resolved' ? 'bg-yellow-100 text-yellow-600' :
                                                                    'bg-gray-100 text-gray-400'
                                                            }`}>
                                                            {t.status === 'open' ? '待处理' : t.status === 'pending' ? '待回复' : t.status === 'resolved' ? '已解决' : '已关闭'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-sm text-gray-400">
                                                        <span>{t.user_email?.split('@')[0]}</span>
                                                        <span>{new Date(t.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Chat Area */}
                                    <div className={`${selectedTicket ? 'flex' : 'hidden lg:flex'} flex-1 flex-col bg-gray-50 dark:bg-gray-950`}>
                                        {selectedTicket ? (
                                            <>
                                                <div className="p-4 lg:p-5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center gap-3">
                                                    {/* Mobile Back Button */}
                                                    <button
                                                        onClick={() => setSelectedTicket(null)}
                                                        className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                                    >
                                                        <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-bold text-gray-900 dark:text-white text-base lg:text-lg truncate">{selectedTicket.title}</h3>
                                                        <p className="text-sm text-gray-500 mt-0.5 truncate">用户: {selectedTicket.user_email}</p>
                                                    </div>
                                                    <select
                                                        value={selectedTicket.status}
                                                        onChange={(e) => handleUpdateTicketStatus(e.currentTarget.value)}
                                                        className="px-4 py-2 border-none bg-gray-100 dark:bg-gray-800 rounded-xl outline-none font-medium cursor-pointer"
                                                    >
                                                        <option value="open">待处理</option>
                                                        <option value="pending">待回复</option>
                                                        <option value="resolved">已解决</option>
                                                        <option value="closed">已关闭</option>
                                                    </select>
                                                </div>

                                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                                    {selectedTicket.messages?.map(msg => (
                                                        <div key={msg.id} className={`flex gap-3 ${msg.is_admin ? 'flex-row-reverse' : 'flex-row'}`}>
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${msg.is_admin ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-gray-600'
                                                                }`}>
                                                                {msg.is_admin ? <UserCog size={20} /> : <User size={20} />}
                                                            </div>
                                                            <div className={`max-w-[75%] rounded-2xl p-4 ${msg.is_admin
                                                                ? 'bg-amber-500 text-white rounded-tr-none shadow-lg shadow-amber-500/20'
                                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none'
                                                                }`}>
                                                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                                                <p className={`text-xs mt-2 opacity-70 ${msg.is_admin ? 'text-amber-100' : 'text-gray-400'}`}>
                                                                    {new Date(msg.created_at).toLocaleString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div ref={messagesEndRef} />
                                                </div>

                                                <div className="p-5 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
                                                    <div className="flex gap-3">
                                                        <input
                                                            type="text"
                                                            value={adminReplyContent}
                                                            onChange={(e) => setAdminReplyContent(e.currentTarget.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleAdminReply()}
                                                            placeholder="作为管理员回复..."
                                                            className="flex-1 px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-amber-500 outline-none"
                                                        />
                                                        <button
                                                            onClick={handleAdminReply}
                                                            disabled={!adminReplyContent.trim()}
                                                            className="p-4 bg-amber-600 text-white rounded-2xl hover:bg-amber-700 disabled:opacity-50 transition shadow-lg shadow-amber-500/30"
                                                        >
                                                            <Send className="w-6 h-6" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                                <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                                                <p className="text-lg">选择左侧工单查看详情</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Conversations */}
                            {activeTab === 'conversations' && (
                                <div className="flex flex-col lg:flex-row h-[calc(100vh-200px)] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                                    {/* Conversation List */}
                                    <div className={`${selectedConversation ? 'hidden lg:flex' : 'flex'} lg:w-1/3 w-full border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-800 flex-col ${!selectedConversation ? 'flex-1' : ''}`}>
                                        <div className="p-3 lg:p-4 border-b border-gray-100 dark:border-gray-800">
                                            <input
                                                type="text"
                                                value={conversationSearch}
                                                onChange={(e) => setConversationSearch(e.currentTarget.value)}
                                                placeholder="搜索用户邮箱..."
                                                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-amber-500 outline-none transition text-sm"
                                            />
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            {conversations.length === 0 ? (
                                                <div className="p-12 text-center text-gray-400">
                                                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                    <p>暂无对话记录</p>
                                                </div>
                                            ) : (
                                                conversations.map(conv => (
                                                    <div
                                                        key={conv.id}
                                                        onClick={() => loadConversationDetail(conv.id)}
                                                        className={`p-4 border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${selectedConversation?.id === conv.id ? 'bg-amber-50 dark:bg-amber-900/10 border-l-4 border-l-amber-500' : ''
                                                            }`}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <h4 className="font-medium text-gray-800 dark:text-gray-200 truncate flex-1">
                                                                {conv.title || '未命名对话'}
                                                            </h4>
                                                            <span className="text-xs text-gray-400 ml-2">{conv.message_count} 条消息</span>
                                                        </div>
                                                        <div className="flex justify-between text-sm text-gray-400">
                                                            <span className="truncate">{conv.user_email}</span>
                                                            <span>{new Date(conv.updated_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Conversation Detail */}
                                    <div className={`${selectedConversation ? 'flex' : 'hidden lg:flex'} flex-1 flex-col bg-gray-50 dark:bg-gray-950`}>
                                        {selectedConversation ? (
                                            <>
                                                <div className="p-4 lg:p-5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center gap-3">
                                                    <button
                                                        onClick={() => setSelectedConversation(null)}
                                                        className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                                    >
                                                        <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-bold text-gray-900 dark:text-white text-base lg:text-lg truncate">
                                                            {selectedConversation.title || '未命名对话'}
                                                        </h3>
                                                        <p className="text-sm text-gray-500 mt-0.5">
                                                            用户: {selectedConversation.user_email} · {selectedConversation.message_count} 条消息
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('确定要删除这个对话吗？')) {
                                                                await adminDeleteConversation(selectedConversation.id);
                                                                setSelectedConversation(null);
                                                                loadData();
                                                            }
                                                        }}
                                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                                        title="删除对话"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>

                                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                                    {selectedConversation.messages?.map(msg => (
                                                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-gray-600'
                                                                }`}>
                                                                {msg.role === 'user' ? <User size={20} /> : <MessageSquare size={20} />}
                                                            </div>
                                                            <div className={`max-w-[75%] rounded-2xl p-4 ${msg.role === 'user'
                                                                ? 'bg-amber-100 dark:bg-amber-900/30 text-gray-800 dark:text-gray-200 rounded-tl-none'
                                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tr-none'
                                                                }`}>
                                                                {msg.is_thought && (
                                                                    <div className="text-xs text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                                                                        <Clock className="w-3 h-3" />
                                                                        思考过程 {msg.thinking_duration && `(${msg.thinking_duration}ms)`}
                                                                    </div>
                                                                )}
                                                                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                                                {msg.images && msg.images.length > 0 && (
                                                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                                                        {msg.images.map((img, idx) => (
                                                                            <img
                                                                                key={idx}
                                                                                src={img.base64}
                                                                                alt="attachment"
                                                                                className="rounded-lg max-h-32 w-full object-cover"
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <p className={`text-xs mt-2 text-gray-400`}>
                                                                    {new Date(msg.created_at).toLocaleString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                                <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                                                <p className="text-lg">选择左侧对话查看详情</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            {isTokenDrawerOpen && (
                <div className="fixed inset-0 z-50">
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
                                    placeholder="留空则使用默认接口"
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
        </div>
    );
};

// Stats Card Component
interface StatCardProps {
    label: string;
    value: number;
    suffix?: string;
    icon: React.ElementType;
    color: 'amber' | 'pink' | 'blue' | 'green' | 'purple' | 'orange' | 'yellow';
}

const StatCard = ({ label, value, suffix, icon: Icon, color }: StatCardProps) => {
    const colorClasses = {
        amber: 'from-amber-500 to-orange-500 shadow-amber-500/30',
        pink: 'from-pink-500 to-rose-500 shadow-pink-500/30',
        blue: 'from-blue-500 to-indigo-500 shadow-blue-500/30',
        green: 'from-green-500 to-emerald-500 shadow-green-500/30',
        purple: 'from-purple-500 to-violet-500 shadow-purple-500/30',
        orange: 'from-orange-500 to-orange-600 shadow-orange-500/30',
        yellow: 'from-yellow-400 to-yellow-500 shadow-yellow-500/30',
    };

    return (
        <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-2xl p-6 text-white shadow-xl`}>
            <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                </div>
            </div>
            <div className="text-4xl font-black mb-1">{value.toLocaleString()}</div>
            <div className="text-sm opacity-90 flex items-center gap-1">
                <span>{label}</span>
                {suffix && <span className="opacity-75">{suffix}</span>}
            </div>
        </div>
    );
};

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
            {helper && (
                <div className="text-[10px] text-gray-400 mt-1">{helper}</div>
            )}
        </div>
    );
};
