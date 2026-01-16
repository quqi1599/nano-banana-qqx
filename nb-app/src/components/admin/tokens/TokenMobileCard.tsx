import React from 'react';
import { RefreshCw, Power } from 'lucide-react';
import { TokenInfo } from '../../../services/adminService';
import { getTokenStatus, formatQuota, getQuotaProgress, isLowBalance } from '../utils/tokenUtils';

interface TokenMobileCardProps {
    token: TokenInfo;
    onCheckQuota: (id: string) => void;
    onToggleToken: (id: string, currentStatus: boolean) => void;
    checkingQuotaTokenId: string | null;
}

export const TokenMobileCard: React.FC<TokenMobileCardProps> = ({
    token,
    onCheckQuota,
    onToggleToken,
    checkingQuotaTokenId,
}) => {
    const status = getTokenStatus(token);

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4">
            {/* Header: Name and Status */}
            <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{token.name}</div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${status.text} ${status.bg}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
                            优先级 {token.priority}
                        </span>
                    </div>
                </div>
            </div>

            {/* Quota Section */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">额度余额</span>
                    <span className="text-sm font-semibold font-mono text-gray-900 dark:text-gray-100">
                        {formatQuota(token.remaining_quota)}
                    </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${isLowBalance(token) ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${getQuotaProgress(token.remaining_quota)}%` }}
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={() => onCheckQuota(token.id)}
                    disabled={checkingQuotaTokenId === token.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                    刷新额度
                </button>
                <button
                    onClick={() => onToggleToken(token.id, token.is_active)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition ${
                        token.is_active
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                    }`}
                >
                    <Power className="w-4 h-4" />
                    {token.is_active ? '禁用' : '启用'}
                </button>
            </div>
        </div>
    );
};
