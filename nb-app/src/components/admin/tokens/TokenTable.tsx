import React from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown, Copy, Check, Eye, EyeOff, RefreshCw, Power, Trash2, Loader2, Key } from 'lucide-react';
import { TokenInfo } from '../../../../../services/adminService';
import { getTokenStatus, formatQuota, getQuotaProgress, isLowBalance, formatDateTime } from '../utils/tokenUtils';

interface TokenTableProps {
    sortedTokens: TokenInfo[];
    sortConfig: { key: 'priority' | 'remaining_quota' | 'last_used_at'; direction: 'asc' | 'desc' };
    onSort: (key: 'priority' | 'remaining_quota' | 'last_used_at') => void;
    tokenBaseUrlDrafts: Record<string, string>;
    onBaseUrlDraftChange: (id: string, value: string) => void;
    onSaveBaseUrl: (id: string) => void;
    onCheckQuota: (id: string) => void;
    onToggleToken: (id: string, currentStatus: boolean) => void;
    onDeleteToken: (id: string) => void;
    onCopyTokenKey: (id: string, value: string) => void;
    onRevealTokenKey: (id: string) => void;
    checkingQuotaTokenId: string | null;
    savingTokenUrl: Record<string, boolean>;
    copiedTokenId: string | null;
    tokenSecrets: Record<string, string>;
    revealedTokenIds: Record<string, boolean>;
}

export const TokenTable: React.FC<TokenTableProps> = ({
    sortedTokens,
    sortConfig,
    onSort,
    tokenBaseUrlDrafts,
    onBaseUrlDraftChange,
    onSaveBaseUrl,
    onCheckQuota,
    onToggleToken,
    onDeleteToken,
    onCopyTokenKey,
    onRevealTokenKey,
    checkingQuotaTokenId,
    savingTokenUrl,
    copiedTokenId,
    tokenSecrets,
    revealedTokenIds,
}) => {
    return (
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
                                    onClick={() => onSort('priority')}
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
                                    onClick={() => onSort('remaining_quota')}
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
                                    onClick={() => onSort('last_used_at')}
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
                                            <button onClick={() => onCopyTokenKey(token.id, displayKey)} className="p-1 hover:text-cream-600 transition">
                                                {copiedTokenId === token.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                            </button>
                                            <button onClick={() => onRevealTokenKey(token.id)} disabled={!secretKey} className="p-1 hover:text-cream-600 transition disabled:opacity-30">
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
                                                <div className={`h-full rounded-full ${isLowBalance(token) ? 'bg-brand-500' : 'bg-green-500'}`} style={{ width: `${getQuotaProgress(token.remaining_quota)}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="url"
                                                value={baseUrlDraft}
                                                onChange={(e) => onBaseUrlDraftChange(token.id, e.currentTarget.value)}
                                                placeholder="自定义基础地址"
                                                className="w-full min-w-[180px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-xs focus:ring-1 focus:ring-cream-500 outline-none transition"
                                            />
                                            {baseUrlDirty && (
                                                <button
                                                    onClick={() => onSaveBaseUrl(token.id)}
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
                                            <button onClick={() => onCheckQuota(token.id)} disabled={checkingQuotaTokenId === token.id} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition" title="刷新额度">
                                                <RefreshCw className={`w-3.5 h-3.5 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                                            </button>
                                            <button onClick={() => onToggleToken(token.id, token.is_active)} className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition ${token.is_active ? 'text-gray-400 hover:text-red-500' : 'text-green-600'}`} title={token.is_active ? '禁用' : '启用'}>
                                                <Power className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => onDeleteToken(token.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition" title="删除">
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
    );
};
