import React, { useState, useMemo } from 'react';
import { TokenInfo } from '../../../../../services/adminService';

type SortKey = 'priority' | 'remaining_quota' | 'last_used_at';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

interface SortResult {
    sortedTokens: TokenInfo[];
    sortConfig: SortConfig;
    handleSort: (key: SortKey) => void;
}

const parseQuota = (quota?: number | null) => {
    const value = Number(quota);
    return Number.isNaN(value) ? null : value;
};

export const useTokenSorting = (tokens: TokenInfo[], initialConfig: SortConfig = {
    key: 'priority',
    direction: 'desc',
}): SortResult => {
    const [sortConfig, setSortConfig] = React.useState<SortConfig>(initialConfig);

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

    return { sortedTokens, sortConfig, handleSort };
};
