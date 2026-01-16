import { TokenInfo } from '../../../../../services/adminService';

const lowBalanceThreshold = 10;

export const parseQuota = (quota?: number | null) => {
    const value = Number(quota);
    return Number.isNaN(value) ? null : value;
};

export const formatQuota = (quota?: number | null): string => {
    if (quota === null || quota === undefined || Number.isNaN(Number(quota))) return '--';
    const value = Number(quota);
    const isUnlimited = !Number.isFinite(value) || value === Infinity;
    const { formatBalance } = require('../../../../services/balanceService');
    return formatBalance(value, isUnlimited);
};

export const getQuotaProgress = (quota?: number | null): number => {
    const value = parseQuota(quota);
    if (value === null) return 0;
    if (!Number.isFinite(value)) return 100;
    const progress = Math.min(100, (value / lowBalanceThreshold) * 100);
    return value <= 0 ? 0 : Math.max(6, progress);
};

export const isCooling = (token: TokenInfo): boolean => {
    if (!token.cooldown_until || !token.is_active) return false;
    const cooldownTime = new Date(token.cooldown_until).getTime();
    return Number.isFinite(cooldownTime) && cooldownTime > Date.now();
};

export const isLowBalance = (token: TokenInfo): boolean => {
    const value = parseQuota(token.remaining_quota);
    if (value === null || !Number.isFinite(value)) return false;
    return value <= lowBalanceThreshold;
};

export const formatDateTime = (value?: string | null): string => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
};

export const getTokenStatus = (token: TokenInfo) => {
    if (!token.is_active) {
        return {
            label: '停用',
            dot: 'bg-gray-400',
            text: 'text-gray-500 dark:text-gray-400',
            bg: 'bg-gray-100 dark:bg-gray-800',
            detail: '已停用',
        };
    }
    if (isCooling(token)) {
        return {
            label: '冷却中',
            dot: 'bg-amber-500',
            text: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-100 dark:bg-amber-900/30',
            detail: `冷却至 ${formatDateTime(token.cooldown_until)}`,
        };
    }
    const failureNote = token.failure_count ? `失败 ${token.failure_count}` : '正常';
    return {
        label: '可用',
        dot: 'bg-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        detail: failureNote,
    };
};

export const getTokenSummary = (tokens: TokenInfo[]) => {
    const coolingCount = tokens.filter(isCooling).length;
    const availableCount = tokens.filter((token) => token.is_active && !isCooling(token)).length;
    const lowBalanceCount = tokens.filter((token) => token.is_active && isLowBalance(token)).length;
    return {
        total: tokens.length,
        available: availableCount,
        cooling: coolingCount,
        lowBalance: lowBalanceCount,
    };
};
