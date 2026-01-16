import React from 'react';
import { RefreshCw, Power } from 'lucide-react';
import { TokenInfo } from '../../../../../services/adminService';
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
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
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
                    <button onClick={() => onCheckQuota(token.id)} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-500">
                        <RefreshCw className={`w-4 h-4 ${checkingQuotaTokenId === token.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => onToggleToken(token.id, token.is_active)} className={`p-2 bg-gray-50 dark:bg-gray-800 rounded-lg ${token.is_active ? 'text-gray-400' : 'text-green-600'}`}>
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
                    <div className={`h-full ${isLowBalance(token) ? 'bg-brand-500' : 'bg-green-500'}`} style={{ width: `${getQuotaProgress(token.remaining_quota)}%` }} />
                </div>
            </div>
        </div>
    );
};
