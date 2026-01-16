import React from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown, Copy, Check, Eye, EyeOff, RefreshCw, Power, Trash2, Loader2, Key } from 'lucide-react';
import { TokenInfo } from '../../../services/adminService';
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
            <div className="overflow-x-auto">
                <div className="overflow-auto max-h-[60vh]">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 shadow-sm">
                            <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                <th className="px-5 py-4 font-semibold min-w-[200px]">名称 / Key</th>
                                <th className="px-5 py-4 font-semibold whitespace-nowrap">状态</th>
                                <th className="px-5 py-4 font-semibold text-center whitespace-nowrap">
                                    <button
                                        type="button"
                                        onClick={() => onSort('priority')}
                                        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition"
                                    >
                                        优先级
                                        {sortConfig.key === 'priority' ? (
                                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                                        ) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
                                    </button>
                                </th>
                                <th className="px-5 py-4 font-semibold whitespace-nowrap">
                                    <button
                                        type="button"
                                        onClick={() => onSort('remaining_quota')}
                                        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition"
                                    >
                                        额度余额
                                        {sortConfig.key === 'remaining_quota' ? (
                                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                                        ) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
                                    </button>
                                </th>
                                <th className="px-5 py-4 font-semibold min-w-[220px]">Base URL</th>
                                <th className="px-5 py-4 font-semibold whitespace-nowrap">
                                    <button
                                        type="button"
                                        onClick={() => onSort('last_used_at')}
                                        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition"
                                    >
                                        最近使用
                                        {sortConfig.key === 'last_used_at' ? (
                                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                                        ) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
                                    </button>
                                </th>
                                <th className="px-5 py-4 font-semibold text-center whitespace-nowrap">请求数</th>
                                <th className="px-5 py-4 font-semibold text-right whitespace-nowrap min-w-[140px]">操作</th>
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
                                        <td className="px-5 py-4 align-top">
                                            <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{token.name}</div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400 break-all max-w-[140px]">
                                                    {displayKey}
                                                </code>
                                                <button
                                                    onClick={() => onCopyTokenKey(token.id, displayKey)}
                                                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-cream-600 transition"
                                                    title="复制"
                                                >
                                                    {copiedTokenId === token.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                                {secretKey && (
                                                    <button
                                                        onClick={() => onRevealTokenKey(token.id)}
                                                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-cream-600 transition"
                                                        title={isRevealed ? '隐藏完整 Key' : '显示完整 Key'}
                                                    >
                                                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2" title={status.detail}>
                                                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${status.dot}`} />
                                                <span className={`text-xs font-medium whitespace-nowrap ${status.text}`}>{status.label}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="inline-block text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-md text-gray-600 dark:text-gray-300">
                                                {token.priority}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
                                                    {formatQuota(token.remaining_quota)}
                                                </div>
                                                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-300 ${isLowBalance(token) ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${getQuotaProgress(token.remaining_quota)}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="url"
                                                    value={baseUrlDraft}
                                                    onChange={(e) => onBaseUrlDraftChange(token.id, e.currentTarget.value)}
                                                    placeholder="默认端点"
                                                    className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-cream-500 outline-none transition"
                                                />
                                                {baseUrlDirty && (
                                                    <button
                                                        onClick={() => onSaveBaseUrl(token.id)}
                                                        disabled={savingTokenUrl[token.id]}
                                                        className="p-2 rounded-lg bg-cream-100 text-cream-700 hover:bg-cream-200 dark:bg-cream-900/30 dark:text-cream-300 transition flex-shrink-0"
                                                        title="保存"
                                                    >
                                                        {savingTokenUrl[token.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                                            {formatDateTime(token.last_used_at)}
                                        </td>
                                        <td className="px-5 py-4 text-center font-mono text-sm text-gray-600 dark:text-gray-400">
                                            {token.total_requests.toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => onCheckQuota(token.id)}
                                                    disabled={checkingQuotaTokenId === token.id}
                                                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
                                                    title="刷新额度"
                                                >
                                                    <RefreshCw className={`w-4 h-4 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                                                </button>
                                                <button
                                                    onClick={() => onToggleToken(token.id, token.is_active)}
                                                    className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition ${token.is_active ? 'text-gray-400 hover:text-red-500' : 'text-emerald-600 hover:text-emerald-700'}`}
                                                    title={token.is_active ? '禁用' : '启用'}
                                                >
                                                    <Power className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => onDeleteToken(token.id)}
                                                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition"
                                                    title="删除"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedTokens.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="py-16 text-center text-gray-400">
                                        <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p className="text-sm">暂无 Token，点击上方按钮创建。</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
