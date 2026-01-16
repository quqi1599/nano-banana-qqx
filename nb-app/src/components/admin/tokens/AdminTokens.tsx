import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { getTokens, addToken, refreshAllTokensQuota, type TokenInfo } from '../../../services/adminService';
import { getBackendUrl } from '../../../utils/backendUrl';
import { TokenSummaryCard } from './TokenSummaryCard';
import { useTokenSorting } from './hooks/useTokenSorting';
import { useTokenActions } from './hooks/useTokenActions';
import { TokenTable } from './TokenTable';
import { TokenMobileCard } from './TokenMobileCard';
import { TokenDrawer } from './TokenDrawer';
import { ADMIN_CONFIG } from '../../../constants/admin';

export const AdminTokens = () => {
    const apiBaseUrl = getBackendUrl();
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [loading, setLoading] = useState(false);

    // Token secrets state
    const [tokenSecrets, setTokenSecrets] = useState<Record<string, string>>({});
    const [revealedTokenIds, setRevealedTokenIds] = useState<Record<string, boolean>>({});
    const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

    // Base URL drafts
    const [tokenBaseUrlDrafts, setTokenBaseUrlDrafts] = useState<Record<string, string>>({});

    // Sorting
    const { sortedTokens, sortConfig, handleSort } = useTokenSorting(tokens);

    // Token actions
    const {
        handleToggleToken,
        handleDeleteToken,
        handleCheckQuota,
        handleSaveTokenBaseUrl,
        error,
        setError,
        checkingQuotaTokenId,
        savingTokenUrl,
    } = useTokenActions();

    // Token drawer state
    const [isTokenDrawerOpen, setIsTokenDrawerOpen] = useState(false);
    const [addingToken, setAddingToken] = useState(false);

    // ===== 一键刷新所有 Token 额度 =====
    const [refreshingAll, setRefreshingAll] = useState(false);
    const [refreshSuccessMessage, setRefreshSuccessMessage] = useState<string | null>(null);

    // Initialize base URL drafts when tokens change
    useEffect(() => {
        const nextDrafts: Record<string, string> = {};
        tokens.forEach((token) => {
            nextDrafts[token.id] = token.base_url || '';
        });
        setTokenBaseUrlDrafts(nextDrafts);
    }, [tokens]);

    // Initial load
    useEffect(() => {
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
        loadData();
    }, []);

    // Handle save token base URL
    const handleSaveBaseUrl = async (id: string) => {
        await handleSaveTokenBaseUrl(id, tokenBaseUrlDrafts[id] || '', tokens, (updated) => {
            setTokens(updated);
        });
    };

    // Handle check quota - wrapper to call the hook's handleCheckQuota
    const onCheckQuota = async (id: string) => {
        await handleCheckQuota(id, apiBaseUrl, (updated) => {
            setTokens(prev => prev.map(t => t.id === id ? updated : t));
        });
    };

    // Handle toggle and delete with proper callback
    const handleToggle = async (id: string, currentStatus: boolean) => {
        await handleToggleToken(id, currentStatus, async () => {
            const data = await getTokens();
            setTokens(data);
        });
    };

    const handleDelete = async (id: string) => {
        await handleDeleteToken(id, async () => {
            const data = await getTokens();
            setTokens(data);
        });
    };

    // Handle add token
    const handleAddToken = async (data: { name: string; apiKey: string; baseUrl: string; priority: number }) => {
        setAddingToken(true);
        try {
            const created = await addToken(data.name, data.apiKey, data.priority, data.baseUrl);
            setTokenSecrets((prev) => ({ ...prev, [created.id]: data.apiKey }));
            setIsTokenDrawerOpen(false);

            // Reload tokens
            const updated = await getTokens();
            setTokens(updated);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setAddingToken(false);
        }
    };

    // Handle copy token key
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

    // Handle reveal token key
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

    // ===== 一键刷新所有 Token 额度 =====
    /**
     * 并发刷新所有启用 Token 的额度
     * 刷新完成后重新加载 Token 列表，并显示结果提示
     */
    const handleRefreshAllQuota = async () => {
        if (refreshingAll) return;

        const activeTokenCount = tokens.filter(t => t.is_active).length;
        if (activeTokenCount === 0) {
            setError('没有启用的 Token 可刷新');
            return;
        }

        setRefreshingAll(true);
        setError('');
        setRefreshSuccessMessage(null);

        try {
            const result = await refreshAllTokensQuota();

            // 重新加载 Token 列表以获取最新额度
            const updated = await getTokens();
            setTokens(updated);

            // 显示结果消息
            if (result.failure_count === 0) {
                setRefreshSuccessMessage(`全部刷新成功！共 ${result.success_count} 个 Token`);
            } else if (result.success_count === 0) {
                setError(`全部刷新失败，共 ${result.failure_count} 个 Token`);
            } else {
                setRefreshSuccessMessage(`刷新完成：成功 ${result.success_count} 个，失败 ${result.failure_count} 个`);
            }

            // 3 秒后清除成功消息
            setTimeout(() => setRefreshSuccessMessage(null), 3000);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setRefreshingAll(false);
        }
    };

    // Calculate summary
    const tokenSummary = {
        total: tokens.length,
        available: tokens.filter((t) => t.is_active && !tokens.filter(x => {
            if (!x.cooldown_until || !x.is_active) return false;
            return new Date(x.cooldown_until).getTime() > Date.now();
        }).some(x => x.id === t.id)).length,
        cooling: tokens.filter(t => {
            if (!t.cooldown_until || !t.is_active) return false;
            return new Date(t.cooldown_until).getTime() > Date.now();
        }).length,
        lowBalance: tokens.filter(t => {
            const value = Number(t.remaining_quota);
            return !Number.isNaN(value) && value !== null && value <= ADMIN_CONFIG.LOW_BALANCE_THRESHOLD;
        }).length,
    };

    return (
        <div className="space-y-4 lg:space-y-6 animate-fade-in-up">
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3">
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></span>
                    {error}
                </div>
            )}
            {refreshSuccessMessage && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/30 text-green-600 dark:text-green-400 rounded-2xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500"></span>
                    {refreshSuccessMessage}
                </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-base lg:text-lg font-bold text-gray-900 dark:text-white">Token 管理</h3>
                    <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                        管理 API 密钥、额度与权限
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* 一键刷新所有 Token 额度按钮 */}
                    <button
                        onClick={handleRefreshAllQuota}
                        disabled={refreshingAll || tokens.filter(t => t.is_active).length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="并发刷新所有启用 Token 的额度"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} />
                        {refreshingAll ? '刷新中...' : '一键刷新'}
                    </button>
                    <button
                        onClick={() => setIsTokenDrawerOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cream-600 text-white text-sm font-semibold hover:bg-cream-700 transition shadow-lg shadow-cream-500/20"
                    >
                        <Plus className="w-4 h-4" />
                        新建 Token
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <TokenSummaryCard label="总计" value={tokenSummary.total} tone="neutral" />
                <TokenSummaryCard label="可用" value={tokenSummary.available} tone="ok" />
                <TokenSummaryCard label="冷却中" value={tokenSummary.cooling} tone="warn" />
                <TokenSummaryCard label="额度不足" value={tokenSummary.lowBalance} tone="low" helper={`≤${ADMIN_CONFIG.LOW_BALANCE_THRESHOLD}`} />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                <TokenTable
                    sortedTokens={sortedTokens}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tokenBaseUrlDrafts={tokenBaseUrlDrafts}
                    onBaseUrlDraftChange={(id, value) => setTokenBaseUrlDrafts(prev => ({ ...prev, [id]: value }))}
                    onSaveBaseUrl={handleSaveBaseUrl}
                    onCheckQuota={onCheckQuota}
                    onToggleToken={handleToggle}
                    onDeleteToken={handleDelete}
                    onCopyTokenKey={handleCopyTokenKey}
                    onRevealTokenKey={handleRevealTokenKey}
                    checkingQuotaTokenId={checkingQuotaTokenId}
                    savingTokenUrl={savingTokenUrl}
                    copiedTokenId={copiedTokenId}
                    tokenSecrets={tokenSecrets}
                    revealedTokenIds={revealedTokenIds}
                />

                <div className="md:hidden p-3 space-y-3">
                    {sortedTokens.map((token) => (
                        <TokenMobileCard
                            key={token.id}
                            token={token}
                            onCheckQuota={onCheckQuota}
                            onToggleToken={handleToggle}
                            checkingQuotaTokenId={checkingQuotaTokenId}
                        />
                    ))}
                </div>
            </div>

            <TokenDrawer
                isOpen={isTokenDrawerOpen}
                onClose={() => setIsTokenDrawerOpen(false)}
                onSubmit={handleAddToken}
                addingToken={addingToken}
                apiBaseUrl={apiBaseUrl}
            />
        </div>
    );
};
