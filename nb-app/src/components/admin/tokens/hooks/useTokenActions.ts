import { useState } from 'react';
import { updateToken, deleteToken, checkTokenQuota, type TokenInfo } from '../../../../services/adminService';

interface TokenActionsResult {
    handleToggleToken: (id: string, currentStatus: boolean, onUpdated: () => Promise<void>) => Promise<void>;
    handleDeleteToken: (id: string, onUpdated: () => Promise<void>) => Promise<void>;
    handleCheckQuota: (id: string, apiBaseUrl: string, onUpdated: (token: TokenInfo) => void) => Promise<void>;
    handleSaveTokenBaseUrl: (id: string, baseUrl: string, tokens: TokenInfo[], onUpdated: (tokens: TokenInfo[]) => void) => Promise<void>;
    error: string;
    setError: (error: string) => void;
    checkingQuotaTokenId: string | null;
    savingTokenUrl: Record<string, boolean>;
}

export const useTokenActions = (): TokenActionsResult => {
    const [error, setError] = useState('');
    const [checkingQuotaTokenId, setCheckingQuotaTokenId] = useState<string | null>(null);
    const [savingTokenUrl, setSavingTokenUrl] = useState<Record<string, boolean>>({});

    const handleToggleToken = async (id: string, currentStatus: boolean, onUpdated: () => Promise<void>) => {
        try {
            await updateToken(id, { is_active: !currentStatus });
            await onUpdated();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleDeleteToken = async (id: string, onUpdated: () => Promise<void>) => {
        if (!confirm('确定要删除这个 Token 吗？')) return;
        try {
            await deleteToken(id);
            await onUpdated();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleCheckQuota = async (id: string, apiBaseUrl: string, onUpdated: (token: TokenInfo) => void) => {
        setCheckingQuotaTokenId(id);
        try {
            const updated = await checkTokenQuota(id, apiBaseUrl);
            onUpdated(updated);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCheckingQuotaTokenId(null);
        }
    };

    const handleSaveTokenBaseUrl = async (
        id: string,
        baseUrl: string,
        tokens: TokenInfo[],
        onUpdated: (users: TokenInfo[]) => void
    ) => {
        const current = tokens.find(t => t.id === id)?.base_url || null;
        if ((current || null) === baseUrl) return;

        setSavingTokenUrl((prev) => ({ ...prev, [id]: true }));
        try {
            await updateToken(id, { base_url: baseUrl || null });
            onUpdated(tokens.map(t => t.id === id ? { ...t, base_url: baseUrl || null } : t));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSavingTokenUrl((prev) => ({ ...prev, [id]: false }));
        }
    };

    return {
        handleToggleToken,
        handleDeleteToken,
        handleCheckQuota,
        handleSaveTokenBaseUrl,
        error,
        setError,
        checkingQuotaTokenId,
        savingTokenUrl,
    };
};
