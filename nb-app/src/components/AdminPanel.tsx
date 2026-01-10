/**
 * 管理员后台面板
 */
import React, { useState, useEffect, useRef } from 'react';
import { X, Users, Key, Gift, BarChart3, Plus, Trash2, RefreshCw, Copy, Check, Loader2, ShieldCheck, MessageSquare, Send, UserCog, User, FileText, Coins } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import {
    getTokens, addToken, deleteToken, updateToken, checkTokenQuota, TokenInfo,
    getModelPricing, createModelPricing, updateModelPricing, ModelPricingInfo,
    generateRedeemCodes, getRedeemCodes, RedeemCodeInfo,
    getUsers, adjustUserCredits, updateUserNote, AdminUser,
    getDashboardStats, DashboardStats,
} from '../services/adminService';
import { formatBalance } from '../services/balanceService';
import { getApiBaseUrl } from '../utils/endpointUtils';
import { getAllTickets, getTicketDetail, replyTicket, updateTicketStatus, getAdminUnreadCount, Ticket, TicketMessage, TICKET_CATEGORIES, TICKET_STATUS_LABELS, TicketCategory } from '../services/ticketService';

interface AdminPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

type TabType = 'dashboard' | 'tokens' | 'pricing' | 'codes' | 'users' | 'tickets';

export const AdminPanel = ({ isOpen, onClose }: AdminPanelProps) => {
    const { user } = useAuthStore();
    const { settings } = useAppStore();
    const apiBaseUrl = getApiBaseUrl(settings.customEndpoint);
    const [activeTab, setActiveTab] = useState<TabType>('dashboard');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Dashboard
    const [stats, setStats] = useState<DashboardStats | null>(null);

    // Tokens
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenKey, setNewTokenKey] = useState('');
    const [newTokenBaseUrl, setNewTokenBaseUrl] = useState('');
    const [newTokenPriority, setNewTokenPriority] = useState(0);
    const [checkingQuotaTokenId, setCheckingQuotaTokenId] = useState<string | null>(null);
    const [tokenBaseUrlDrafts, setTokenBaseUrlDrafts] = useState<Record<string, string>>({});

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
    const [userSearch, setUserSearch] = useState('');
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [adjustAmount, setAdjustAmount] = useState(0);
    const [editingNoteUserId, setEditingNoteUserId] = useState<string | null>(null);
    const [noteContent, setNoteContent] = useState('');

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
                const data = await getDashboardStats();
                setStats(data);
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
                const data = await getAllTickets(ticketStatusFilter, ticketCategoryFilter);
                setTickets(data);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
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

    const formatQuota = (quota: number) => {
        if (quota === null || quota === undefined || Number.isNaN(quota)) return '--';
        const isUnlimited = !Number.isFinite(quota) || quota === Infinity;
        return formatBalance(Number(quota), isUnlimited);
    };

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
            // 更新列表中的 token
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
            const result = await generateRedeemCodes(
                generateCount,
                generateAmount,
                generatePro3Amount,
                generateFlashAmount
            );
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
                                <div className="space-y-8 animate-in fade-in duration-300">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <StatCard label="总用户" value={stats.total_users} onClick={() => setActiveTab('users')} />
                                        <StatCard label="今日活跃" value={stats.active_users_today} onClick={() => setActiveTab('users')} />
                                        <StatCard label="今日请求" value={stats.total_requests_today} />
                                        <StatCard label="Token池状态" value={`${stats.available_tokens}/${stats.token_pool_count}`} onClick={() => setActiveTab('tokens')} />
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-cream-50/50 dark:bg-gray-800/50 rounded-2xl p-6 border border-cream-100 dark:border-gray-800">
                                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">模型消耗占比</h3>
                                            {stats.model_stats.length > 0 ? (
                                                <div className="space-y-4">
                                                    {stats.model_stats.map(m => (
                                                        <div key={m.model_name} className="group">
                                                            <div className="flex justify-between text-sm mb-1.5">
                                                                <span className="font-medium text-gray-700 dark:text-gray-300">{m.model_name}</span>
                                                                <span className="text-gray-500">{m.total_requests} 次 / {m.total_credits_used} 次</span>
                                                            </div>
                                                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-cream-500 group-hover:bg-cream-400 transition-all"
                                                                    style={{ width: `${Math.min(100, (m.total_requests / (stats.total_requests_today || 1)) * 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-10 text-gray-500 text-sm italic">今日暂无使用记录数据</div>
                                            )}
                                        </div>

                                        <div className="bg-cream-50/50 dark:bg-gray-800/50 rounded-2xl p-6 border border-cream-100 dark:border-gray-800 flex flex-col items-center justify-center text-center">
                                            <BarChart3 className="w-12 h-12 text-cream-200 mb-2" />
                                            <p className="text-sm text-cream-400">更多细化统计图表正在开发中...</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tokens */}
                            {activeTab === 'tokens' && (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    <div className="bg-cream-50 dark:bg-cream-900/10 p-5 rounded-3xl border border-cream-200 dark:border-cream-900/20 shadow-sm">
                                        <h4 className="text-xs font-bold text-cream-600 dark:text-cream-400 uppercase mb-3 px-1">添加新 API Token</h4>
                                        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                                            <input
                                                type="text"
                                                value={newTokenName}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTokenName(e.currentTarget.value)}
                                                placeholder="名称 (如 Gemini-Pro-1)"
                                                className="flex-1 min-w-[140px] px-4 py-2.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-cream-500 outline-none transition-all placeholder:text-cream-300"
                                            />
                                            <input
                                                type="text"
                                                value={newTokenKey}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTokenKey(e.currentTarget.value)}
                                                placeholder="API Key"
                                                className="flex-[2] min-w-[200px] px-4 py-2.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm font-mono focus:ring-2 focus:ring-cream-500 outline-none transition-all placeholder:text-cream-300"
                                            />
                                            <input
                                                type="text"
                                                value={newTokenBaseUrl}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTokenBaseUrl(e.currentTarget.value)}
                                                placeholder="查询接口 (可选)"
                                                className="flex-[2] min-w-[200px] px-4 py-2.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-cream-500 outline-none transition-all placeholder:text-cream-300"
                                            />
                                            <input
                                                type="number"
                                                value={newTokenPriority}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTokenPriority(Number(e.currentTarget.value))}
                                                placeholder="优先级"
                                                title="数值越大，分发权重越高"
                                                className="w-20 px-3 py-2.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm text-center focus:ring-2 focus:ring-cream-500 outline-none transition-all text-cream-700"
                                            />
                                            <button
                                                onClick={handleAddToken}
                                                disabled={!newTokenName || !newTokenKey}
                                                className="px-6 py-2.5 bg-cream-600 text-white rounded-2xl hover:bg-cream-700 disabled:opacity-50 transition-all font-bold text-sm shadow-md hover:shadow-lg active:scale-95"
                                            >
                                                添加
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase px-1">Token 列表 ({tokens.length})</h4>
                                        {tokens.map(token => (
                                            <div key={token.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-gray-800 border border-cream-100 dark:border-gray-700 rounded-2xl gap-3 hover:shadow-md transition-shadow">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-bold text-cream-950 dark:text-cream-50 uppercase tracking-tight">{token.name}</span>
                                                        <span className="text-[10px] font-bold bg-cream-100 text-cream-700 dark:bg-cream-900/30 dark:text-cream-300 px-2 py-1 rounded-lg">优先级 {token.priority}</span>
                                                    </div>
                                                    <div className="text-xs text-cream-400 truncate font-mono bg-cream-50 dark:bg-gray-900/50 p-1.5 rounded-lg select-all">{token.api_key}</div>
                                                    <div className="mt-2 flex flex-col sm:flex-row gap-2">
                                                        <input
                                                            type="text"
                                                            value={tokenBaseUrlDrafts[token.id] || ''}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                                setTokenBaseUrlDrafts(prev => ({ ...prev, [token.id]: e.currentTarget.value }))
                                                            }
                                                            placeholder="查询接口 (可选)"
                                                            className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-xs focus:ring-2 focus:ring-cream-500 outline-none transition-all placeholder:text-cream-300"
                                                        />
                                                        <button
                                                            onClick={() => handleSaveTokenBaseUrl(token.id)}
                                                            className="px-4 py-2 text-xs font-bold text-cream-600 bg-cream-100 dark:bg-cream-900/20 rounded-xl hover:bg-cream-200 dark:hover:bg-cream-900/30 transition"
                                                        >
                                                            保存接口
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-6 text-sm">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className={`text-[10px] font-black uppercase ${token.is_active ? 'text-green-500' : 'text-rose-400'}`}>
                                                            {token.is_active ? 'ACTIVE' : 'DISABLED'}
                                                        </span>
                                                        <button
                                                            onClick={() => handleToggleToken(token.id, token.is_active)}
                                                            className="text-xs text-cream-600 hover:text-cream-700 font-medium bg-cream-100 dark:bg-cream-900/20 px-3 py-1 rounded-lg transition"
                                                        >
                                                            {token.is_active ? '停止' : '激活'}
                                                        </button>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-cream-400">额度</div>
                                                        <div className="font-bold text-amber-500 flex items-center gap-1">
                                                            {formatQuota(token.remaining_quota)}
                                                            <button
                                                                onClick={() => handleCheckQuota(token.id)}
                                                                disabled={checkingQuotaTokenId === token.id}
                                                                className="p-1 text-cream-400 hover:text-cream-600 hover:bg-cream-50 dark:hover:bg-gray-700 rounded-lg transition disabled:opacity-50"
                                                                title="刷新额度"
                                                            >
                                                                <RefreshCw className={`w-3 h-3 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-cream-400">已处理</div>
                                                        <div className="font-bold text-cream-700 dark:text-cream-300">{token.total_requests}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteToken(token.id)}
                                                        className="p-2 text-cream-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {tokens.length === 0 && (
                                            <div className="text-center py-20 bg-cream-50/50 dark:bg-gray-800/20 rounded-3xl border-2 border-dashed border-cream-200 dark:border-gray-800">
                                                <Key className="w-12 h-12 text-cream-200 mx-auto mb-3" />
                                                <p className="text-cream-400 text-sm">暂无活跃 Token，请在上方添加</p>
                                            </div>
                                        )}
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
                                                disabled={!newModelName.trim() || newModelCredits <= 0}
                                                className="px-6 py-2.5 bg-cream-500 text-white rounded-2xl hover:bg-cream-600 disabled:opacity-50 transition-all font-bold text-sm shadow-md"
                                            >
                                                添加
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
                                                        className="px-3 py-2 text-xs font-bold text-cream-600 bg-cream-100 dark:bg-cream-900/20 rounded-xl hover:bg-cream-200 dark:hover:bg-cream-900/30 transition"
                                                    >
                                                        保存
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
                                                className="px-8 py-2.5 bg-cream-500 text-white rounded-2xl hover:bg-cream-600 transition-all font-bold text-sm shadow-md h-[42px] hover:shadow-lg active:scale-95"
                                            >
                                                一键生成
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
                                    <div className="relative group">
                                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cream-400 group-focus-within:text-cream-600 transition-colors" />
                                        <input
                                            type="text"
                                            value={userSearch}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserSearch(e.currentTarget.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && loadData()}
                                            placeholder="按邮箱或昵称搜索用户信息..."
                                            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-cream-500 outline-none transition-all placeholder:text-cream-300"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase px-1">匹配用户 ({users.length})</h4>
                                        {users.map(u => (
                                            <div key={u.id} className="flex flex-col p-5 bg-white dark:bg-gray-800 border border-cream-100 dark:border-gray-700 rounded-3xl gap-4 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-cream-100 dark:bg-gray-700 flex items-center justify-center font-bold text-cream-600 dark:text-cream-400">
                                                            {u.nickname?.[0] || u.email[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-cream-950 dark:text-cream-50">{u.nickname || '未设置昵称'}</span>
                                                                {u.is_admin && <span className="text-[9px] bg-cream-600 text-white px-2 py-0.5 rounded-full font-black tracking-tighter shadow-sm">ADMIN</span>}
                                                            </div>
                                                            <div className="text-xs text-cream-400">{u.email}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right hidden md:block">
                                                            <div className="text-[10px] uppercase font-bold text-cream-300 mb-0.5">上次登录</div>
                                                            <div className="text-xs font-mono text-cream-600 dark:text-cream-400">
                                                                {u.last_login_at ? new Date(u.last_login_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                            </div>
                                                            <div className="text-[10px] font-mono text-cream-300">{u.last_login_ip || '-'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[10px] uppercase font-bold text-cream-300 mb-0.5">剩余次数</div>
                                                            <div className="text-lg font-black text-amber-500">{u.credit_balance}</div>
                                                        </div>
                                                        <div className="text-right border-l border-cream-100 dark:border-gray-700 pl-6 hidden sm:block">
                                                            <div className="text-[10px] uppercase font-bold text-cream-300 mb-0.5">消耗次数</div>
                                                            <div className="text-lg font-black text-cream-600 dark:text-cream-400">{u.total_usage}</div>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingNoteUserId(editingNoteUserId === u.id ? null : u.id);
                                                                    setNoteContent(u.note || '');
                                                                    setEditingUserId(null);
                                                                }}
                                                                className={`p-2 rounded-xl transition-all ${editingNoteUserId === u.id ? 'bg-amber-100 text-amber-600' : 'bg-cream-50 dark:bg-gray-900 text-cream-400 hover:bg-amber-50 hover:text-amber-500'}`}
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
                                                                className={`p-2 rounded-xl transition-all ${editingUserId === u.id ? 'bg-cream-600 text-white' : 'bg-cream-50 dark:bg-gray-900 text-cream-500 hover:bg-cream-100 hover:text-cream-700'}`}
                                                                title="调整次数"
                                                            >
                                                                <UserCog className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {u.note && !editingNoteUserId && (
                                                    <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-400 p-2 rounded-lg border border-amber-100 dark:border-amber-900/20 flex items-start gap-2">
                                                        <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                                                        <span>{u.note}</span>
                                                    </div>
                                                )}

                                                {editingUserId === u.id && (
                                                    <div className="flex items-center gap-3 mt-2 p-4 bg-cream-100/50 dark:bg-gray-800/50 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                                                        <div className="flex-1">
                                                            <p className="text-[10px] font-bold text-cream-600 mb-2 uppercase">调整剩余次数</p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="number"
                                                                    value={adjustAmount}
                                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdjustAmount(Number(e.currentTarget.value))}
                                                                    placeholder="数量 (正加负减)"
                                                                    className="flex-1 px-4 py-2 rounded-xl border border-cream-200 dark:border-gray-700 dark:bg-gray-800 text-sm font-bold focus:ring-2 focus:ring-cream-500 outline-none"
                                                                />
                                                                <button
                                                                    onClick={() => handleAdjustCredits(u.id)}
                                                                    className="px-6 py-2 bg-cream-600 text-white rounded-xl text-sm font-bold hover:bg-cream-700 shadow-sm"
                                                                >
                                                                    保存修改
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {editingNoteUserId === u.id && (
                                                    <div className="flex items-center gap-3 mt-2 p-4 bg-amber-50/50 dark:bg-amber-900/10 rounded-xl animate-in slide-in-from-top-2 duration-300">
                                                        <div className="flex-1">
                                                            <p className="text-[10px] font-bold text-amber-600 mb-2 uppercase">编辑备注</p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={noteContent}
                                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNoteContent(e.currentTarget.value)}
                                                                    placeholder="输入用户备注信息..."
                                                                    className="flex-1 px-4 py-2 rounded-lg border border-amber-200 dark:border-amber-900/30 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                                />
                                                                <button
                                                                    onClick={() => handleUpdateNote(u.id)}
                                                                    className="px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 shadow-sm"
                                                                >
                                                                    保存备注
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {users.length === 0 && (
                                            <div className="text-center py-20 text-gray-400 italic">没有找到符合搜索条件的用户</div>
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
