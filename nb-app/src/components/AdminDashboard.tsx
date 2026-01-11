/**
 * 管理员专属全屏后台页面
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    X, Users, Key, Gift, BarChart3, Plus, Trash2, RefreshCw, Copy, Check, Loader2,
    ShieldCheck, MessageSquare, Send, UserCog, User, FileText, Image, Coins,
    TrendingUp, Activity, Home, LogOut, Menu, ChevronRight, Clock, Search
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
        try {
            await addToken(
                newTokenName,
                newTokenKey,
                newTokenPriority,
                newTokenBaseUrl.trim() || apiBaseUrl
            );
            setNewTokenName('');
            setNewTokenKey('');
            setNewTokenBaseUrl('');
            setNewTokenPriority(0);
            loadData();
        } catch (err) {
            setError((err as Error).message);
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
        try {
            const updated = await updateToken(id, { base_url: baseUrl });
            setTokens(prev => prev.map(t => t.id === id ? { ...t, base_url: updated.base_url } : t));
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const formatQuota = (quota: number) => {
        if (quota === null || quota === undefined || Number.isNaN(quota)) return '--';
        const isUnlimited = !Number.isFinite(quota) || quota === Infinity;
        return formatBalance(Number(quota), isUnlimited);
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
                                    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 p-4 lg:p-6 rounded-xl lg:rounded-2xl border border-amber-100 dark:border-amber-900/30">
                                        <h4 className="font-bold text-amber-600 dark:text-amber-400 mb-3 lg:mb-4 flex items-center gap-2 text-sm lg:text-base">
                                            <Plus className="w-4 h-4 lg:w-5 lg:h-5" />
                                            添加新 API Token
                                        </h4>
                                        <div className="flex flex-col gap-2 lg:gap-3">
                                            <input
                                                type="text"
                                                value={newTokenName}
                                                onChange={(e) => setNewTokenName(e.currentTarget.value)}
                                                placeholder="名称 (如 Gemini-Pro-1)"
                                                className="w-full px-4 py-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-amber-500 outline-none transition text-sm lg:text-base"
                                            />
                                            <input
                                                type="text"
                                                inputMode="text"
                                                autoCapitalize="off"
                                                autoCorrect="off"
                                                spellCheck="false"
                                                value={newTokenKey}
                                                onChange={(e) => setNewTokenKey(e.currentTarget.value)}
                                                placeholder="API Key"
                                                className="w-full px-4 py-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-mono text-xs lg:text-sm focus:ring-2 focus:ring-amber-500 outline-none transition"
                                            />
                                            <div className="flex gap-2">
                                                <input
                                                    type="url"
                                                    inputMode="url"
                                                    value={newTokenBaseUrl}
                                                    onChange={(e) => setNewTokenBaseUrl(e.currentTarget.value)}
                                                    placeholder="查询接口 (可选)"
                                                    className="flex-1 min-w-0 px-3 lg:px-4 py-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs lg:text-sm focus:ring-2 focus:ring-amber-500 outline-none transition"
                                                />
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    value={newTokenPriority}
                                                    onChange={(e) => setNewTokenPriority(Number(e.currentTarget.value))}
                                                    placeholder="优先级"
                                                    className="w-20 lg:w-24 px-3 lg:px-4 py-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-center focus:ring-2 focus:ring-amber-500 outline-none transition text-sm lg:text-base"
                                                />
                                            </div>
                                            <button
                                                onClick={handleAddToken}
                                                disabled={!newTokenName || !newTokenKey}
                                                className="w-full sm:w-auto sm:min-w-[120px] px-6 lg:px-8 py-3 min-h-[48px] bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-xl hover:from-amber-600 hover:to-yellow-600 disabled:opacity-50 transition font-bold shadow-lg shadow-amber-500/30 text-sm lg:text-base"
                                            >
                                                添加 Token
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 lg:space-y-3">
                                        <h4 className="font-bold text-gray-400 uppercase text-xs lg:text-sm tracking-wider">Token 列表 ({tokens.length})</h4>
                                        {tokens.map(token => (
                                            <div key={token.id} className="bg-white dark:bg-gray-900 rounded-xl lg:rounded-2xl p-3 lg:p-5 border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-shadow">
                                                <div className="flex flex-col gap-3">
                                                    {/* Header Row */}
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className="font-bold text-gray-900 dark:text-white text-sm lg:text-base">{token.name}</span>
                                                                <span className="text-[10px] lg:text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-lg">
                                                                    P{token.priority}
                                                                </span>
                                                                <span className={`text-[10px] lg:text-xs font-bold px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-lg ${token.is_active ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 'bg-red-100 text-red-600 dark:bg-red-900/30'}`}>
                                                                    {token.is_active ? 'ACTIVE' : 'DISABLED'}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs lg:text-sm text-gray-400 truncate font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded-lg select-all">
                                                                {token.api_key}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteToken(token.id)}
                                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition min-h-[36px] min-w-[36px] flex items-center justify-center"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    {/* Base URL Input Row */}
                                                    <div className="flex flex-col sm:flex-row gap-2">
                                                        <input
                                                            type="url"
                                                            inputMode="url"
                                                            value={tokenBaseUrlDrafts[token.id] || ''}
                                                            onChange={(e) =>
                                                                setTokenBaseUrlDrafts(prev => ({ ...prev, [token.id]: e.currentTarget.value }))
                                                            }
                                                            placeholder="查询接口 (可选)"
                                                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs focus:ring-2 focus:ring-amber-500 outline-none transition"
                                                        />
                                                        <button
                                                            onClick={() => handleSaveTokenBaseUrl(token.id)}
                                                            className="px-3 lg:px-4 py-2 text-xs font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/40 transition min-h-[36px] whitespace-nowrap"
                                                        >
                                                            保存接口
                                                        </button>
                                                    </div>

                                                    {/* Stats Row */}
                                                    <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
                                                        <div className="flex items-center gap-4 lg:gap-6">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] lg:text-xs text-gray-400">额度</span>
                                                                <div className="font-bold text-amber-600 text-sm lg:text-lg flex items-center gap-1">
                                                                    {formatQuota(token.remaining_quota)}
                                                                    <button
                                                                        onClick={() => handleCheckQuota(token.id)}
                                                                        disabled={checkingQuotaTokenId === token.id}
                                                                        className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition disabled:opacity-50"
                                                                        title="刷新额度"
                                                                    >
                                                                        <RefreshCw className={`w-3 h-3 lg:w-3.5 lg:h-3.5 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] lg:text-xs text-gray-400">已处理</span>
                                                                <span className="font-bold text-gray-700 dark:text-gray-300 text-sm lg:text-lg">{token.total_requests}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleToggleToken(token.id, token.is_active)}
                                                            className="px-3 py-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg transition min-h-[36px]"
                                                        >
                                                            {token.is_active ? '停用' : '启用'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {tokens.length === 0 && (
                                            <div className="text-center py-20 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800">
                                                <Key className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                                                <p className="text-gray-400">暂无 Token，请在上方添加</p>
                                            </div>
                                        )}
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
