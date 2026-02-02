import { useState, useCallback, useEffect } from 'react';
import { ConversationFilters } from '../../../../services/conversationService';

interface ConversationFiltersResult {
    filters: ConversationFilters;
    setFilters: (filters: ConversationFilters) => void;
    updateFilter: (key: keyof ConversationFilters, value: any) => void;
    clearFilters: () => void;
    hasActiveFilters: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    showFilters: boolean;
    setShowFilters: (show: boolean) => void;
}

export const useConversationFilters = (
    initialUserId: string | null,
    onFiltersChange?: (filters: ConversationFilters) => void
): ConversationFiltersResult => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const [filters, setFiltersState] = useState<ConversationFilters>({
        user_id: initialUserId || undefined,
    });

    const setFilters = (newFilters: ConversationFilters) => {
        setFiltersState(newFilters);
        onFiltersChange?.(newFilters);
    };

    const updateFilter = (key: keyof ConversationFilters, value: any) => {
        setFiltersState(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setFiltersState({ user_id: initialUserId || undefined });
        setSearchQuery('');
    };

    const hasActiveFilters = Object.keys(filters).some(k =>
        k !== 'user_id' && filters[k as keyof ConversationFilters] !== undefined
    ) || searchQuery.length > 0;

    // Reset page when userId prop changes
    useEffect(() => {
        if (initialUserId) {
            setFiltersState({ user_id: initialUserId });
        }
    }, [initialUserId]);

    return {
        filters,
        setFilters,
        updateFilter,
        clearFilters,
        hasActiveFilters,
        searchQuery,
        setSearchQuery,
        showFilters,
        setShowFilters,
    };
};
