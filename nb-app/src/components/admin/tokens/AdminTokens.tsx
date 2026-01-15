import React, { useState, useEffect, useMemo } from 'react';
import {
    Plus, Trash2, RefreshCw, Copy, Check, Loader2,
    ArrowUpDown, ChevronDown, ChevronUp, Eye, EyeOff, Power, Key, X
} from 'lucide-react';
import {
    getTokens, addToken, deleteToken, updateToken, TokenInfo, checkTokenQuota
} from '../../../services/adminService';
import { formatBalance } from '../../../services/balanceService';
import { getApiBaseUrl } from '../../../utils/endpointUtils';
import { useAppStore } from '../../../store/useAppStore';
import { TokenSummaryCard } from './TokenSummaryCard';

type SortKey = 'priority' | 'remaining_quota' | 'last_used_at';

export const AdminTokens = () => {
    const { settings } = useAppStore();
    const apiBaseUrl = getApiBaseUrl(settings.customEndpoint);
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // State for New Token
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenKey, setNewTokenKey] = useState('');
    const [newTokenBaseUrl, setNewTokenBaseUrl] = useState('');
    const [newTokenPriority, setNewTokenPriority] = useState(0);
    const [addingToken, setAddingToken] = useState(false);
    const [isTokenDrawerOpen, setIsTokenDrawerOpen] = useState(false);

    // State for Token Actions
    const [tokenBaseUrlDrafts, setTokenBaseUrlDrafts] = useState<Record<string, string>>({});
    const [checkingQuotaTokenId, setCheckingQuotaTokenId] = useState<string | null>(null);
    const [savingTokenUrl, setSavingTokenUrl] = useState<Record<string, boolean>>({});
    const [tokenSecrets, setTokenSecrets] = useState<Record<string, string>>({});
    const [revealedTokenIds, setRevealedTokenIds] = useState<Record<string, boolean>>({});
    const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'priority',
        direction: 'desc',
    });

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getTokens();
            setTokens(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

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

    return (
        <div className="space-y-4 lg:space-y-6 animate-fade-in-up">
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3">
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></span>
                    {error}
                </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-base lg:text-lg font-bold text-gray-900 dark:text-white">Token 管理</h3>
                    <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                        管理 API 密钥、额度与权限
                    </p>
                </div>
                <button
                    onClick={() => setIsTokenDrawerOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cream-600 text-white text-sm font-semibold hover:bg-cream-700 transition shadow-lg shadow-cream-500/20"
                >
                    <Plus className="w-4 h-4" />
                    新建 Token
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <TokenSummaryCard label="总计" value={tokenSummary.total} tone="neutral" />
                <TokenSummaryCard label="可用" value={tokenSummary.available} tone="ok" />
                <TokenSummaryCard label="冷却中" value={tokenSummary.cooling} tone="warn" />
                <TokenSummaryCard label="额度不足" value={tokenSummary.lowBalance} tone="low" helper={`≤${lowBalanceThreshold}`} />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className="hidden md:block">
                    <div className="overflow-auto max-h-[65vh]">
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
                                                sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                                            ) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 font-semibold">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('remaining_quota')}
                                            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                                        >
                                            额度余额
                                            {sortConfig.key === 'remaining_quota' ? (
                                                sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                                            ) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 font-semibold">Base URL</th>
                                    <th className="px-4 py-3 font-semibold">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('last_used_at')}
                                            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                                        >
                                            最近使用
                                            {sortConfig.key === 'last_used_at' ? (
                                                sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                                            ) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
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
                                        <tr key={token.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/60 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-gray-900 dark:text-gray-100">{token.name}</div>
                                                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                    <span className="font-mono truncate max-w-[160px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">{displayKey}</span>
                                                    <button onClick={() => handleCopyTokenKey(token.id, displayKey)} className="p-1 hover:text-cream-600 transition">
                                                        {copiedTokenId === token.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                                    </button>
                                                    <button onClick={() => handleRevealTokenKey(token.id)} disabled={!secretKey} className="p-1 hover:text-cream-600 transition disabled:opacity-30">
                                                        {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2" title={status.detail}>
                                                    <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                                                    <span className={`text-xs font-medium ${status.text}`}>{status.label}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-300">{token.priority}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1 max-w-[120px]">
                                                    <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
                                                        {formatQuota(token.remaining_quota)}
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                                        <div className={`h-full rounded-full ${isLowBalance(token) ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${getQuotaProgress(token.remaining_quota)}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="url"
                                                        value={baseUrlDraft}
                                                        onChange={(e) => setTokenBaseUrlDrafts((prev) => ({ ...prev, [token.id]: e.currentTarget.value }))}
                                                        placeholder="Override Base URL"
                                                        className="w-full min-w-[180px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs focus:ring-1 focus:ring-cream-500 outline-none transition"
                                                    />
                                                    {baseUrlDirty && (
                                                        <button
                                                            onClick={() => handleSaveTokenBaseUrl(token.id)}
                                                            disabled={savingTokenUrl[token.id]}
                                                            className="p-1.5 rounded-lg bg-cream-100 text-cream-700 hover:bg-cream-200 dark:bg-cream-900/20 dark:text-cream-300 transition"
                                                        >
                                                            {savingTokenUrl[token.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{formatDateTime(token.last_used_at)}</td>
                                            <td className="px-4 py-3 text-center font-mono text-xs">{token.total_requests.toLocaleString()}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => handleCheckQuota(token.id)} disabled={checkingQuotaTokenId === token.id} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition" title="刷新额度">
                                                        <RefreshCw className={`w-3.5 h-3.5 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                                                    </button>
                                                    <button onClick={() => handleToggleToken(token.id, token.is_active)} className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition ${token.is_active ? 'text-gray-400 hover:text-red-500' : 'text-green-600'}`} title={token.is_active ? '禁用' : '启用'}>
                                                        <Power className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteToken(token.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition" title="删除">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {sortedTokens.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="py-20 text-center text-gray-400">
                                            <Key className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                            暂无 Token，请创建。
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile View - Simplified */}
                <div className="md:hidden p-3 space-y-3">
                    {sortedTokens.map((token) => {
                        const status = getTokenStatus(token);
                        return (
                            <div key={token.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-semibold">{token.name}</div>
                                        <div className="flex items-center gap-2 text-xs mt-1">
                                            <span className={`inline-flex items-center gap-1 ${status.text}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                                                {status.label}
                                            </span>
                                            <span className="bg-gray-100 dark:bg-gray-800 px-1.5 rounded text-gray-500">P{token.priority}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => handleCheckQuota(token.id)} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-500">
                                            <RefreshCw className={`w-4 h-4 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                                        </button>
                                        <button onClick={() => handleToggleToken(token.id, token.is_active)} className={`p-2 bg-gray-50 dark:bg-gray-800 rounded-lg ${token.is_active ? 'text-gray-400' : 'text-green-600'}`}>
                                            <Power className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-xs mb-3">
                                    <div className="flex justify-between mb-1">
                                        <span>余额</span>
                                        <span className="font-mono">{formatQuota(token.remaining_quota)}</span>
                                    </div>
                                    <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div className={`h-full ${isLowBalance(token) ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${getQuotaProgress(token.remaining_quota)}%` }} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Token Drawer */}
            {isTokenDrawerOpen && (
                <div className="fixed inset-0 z-[60]">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsTokenDrawerOpen(false)} />
                    <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-xl font-bold">新建 Token</h3>
                            <button onClick={() => setIsTokenDrawerOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-auto p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-semibold mb-2">Token 名称</label>
                                <input value={newTokenName} onChange={e => setNewTokenName(e.currentTarget.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:bg-gray-800 focus:ring-2 focus:ring-cream-500 outline-none" placeholder="e.g. My Token" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-2">API 密钥</label>
                                <input value={newTokenKey} onChange={e => setNewTokenKey(e.currentTarget.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:bg-gray-800 font-mono text-sm focus:ring-2 focus:ring-cream-500 outline-none" placeholder="sk-..." />
                            </div>
                            <button onClick={handleAddToken} disabled={addingToken || !newTokenName} className="w-full py-3 bg-cream-600 text-white rounded-xl hover:bg-cream-700 font-bold transition">
                                {addingToken ? '创建中...' : '创建 Token'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
