/**
 * 管理员后台服务
 */

import { getToken } from './authService';

// 后端 API 地址
const getBackendUrl = (): string => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev && window.location.port === '3000') {
        return 'http://localhost:8000';
    }
    return window.location.origin;
};

const API_BASE = `${getBackendUrl()}/api/admin`;

// 通用请求
const request = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const token = getToken();
    if (!token) throw new Error('请先登录');

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(error.detail || `HTTP error ${response.status}`);
    }

    return response.json();
};

// ========== Token 池管理 ==========

export interface TokenInfo {
    id: string;
    name: string;
    api_key: string;
    base_url?: string | null;
    remaining_quota: number;
    is_active: boolean;
    priority: number;
    total_requests: number;
    last_used_at: string | null;
    created_at: string;
}

export interface ModelPricingInfo {
    id: string;
    model_name: string;
    credits_per_request: number;
    created_at: string;
    updated_at: string;
}

export const getTokens = async (): Promise<TokenInfo[]> => {
    return request('/tokens');
};

export const addToken = async (name: string, apiKey: string, priority: number = 0, baseUrl?: string): Promise<TokenInfo> => {
    const payload: Record<string, unknown> = { name, api_key: apiKey, priority };
    if (baseUrl) {
        payload.base_url = baseUrl;
    }
    return request('/tokens', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

export const updateToken = async (id: string, data: { name?: string; is_active?: boolean; priority?: number; base_url?: string | null }): Promise<TokenInfo> => {
    return request(`/tokens/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

export const deleteToken = async (id: string): Promise<void> => {
    return request(`/tokens/${id}`, { method: 'DELETE' });
};

export const checkTokenQuota = async (id: string, baseUrl?: string): Promise<TokenInfo> => {
    const params = new URLSearchParams();
    if (baseUrl) {
        params.set('base_url', baseUrl);
    }
    const query = params.toString();
    return request(`/tokens/${id}/check-quota${query ? `?${query}` : ''}`, { method: 'POST' });
};

// ========== 模型计费 ==========

export const getModelPricing = async (): Promise<ModelPricingInfo[]> => {
    return request('/model-pricing');
};

export const createModelPricing = async (modelName: string, creditsPerRequest: number): Promise<ModelPricingInfo> => {
    return request('/model-pricing', {
        method: 'POST',
        body: JSON.stringify({ model_name: modelName, credits_per_request: creditsPerRequest }),
    });
};

export const updateModelPricing = async (id: string, creditsPerRequest: number): Promise<ModelPricingInfo> => {
    return request(`/model-pricing/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ credits_per_request: creditsPerRequest }),
    });
};

// ========== 兑换码管理 ==========

export interface RedeemCodeInfo {
    id: string;
    code: string;
    credit_amount: number;
    pro3_credits: number;
    flash_credits: number;
    is_used: boolean;
    used_at: string | null;
    expires_at: string | null;
    created_at: string;
}

export interface GenerateCodesResult {
    batch_id: string;
    codes: string[];
    count: number;
    credit_amount: number;
    pro3_credits: number;
    flash_credits: number;
}

export const generateRedeemCodes = async (
    count: number,
    creditAmount: number,
    pro3Credits: number,
    flashCredits: number,
    expiresDays?: number
): Promise<GenerateCodesResult> => {
    return request('/redeem-codes/generate', {
        method: 'POST',
        body: JSON.stringify({
            count,
            credit_amount: creditAmount,
            pro3_credits: pro3Credits,
            flash_credits: flashCredits,
            expires_days: expiresDays
        }),
    });
};

export const getRedeemCodes = async (batchId?: string, isUsed?: boolean): Promise<RedeemCodeInfo[]> => {
    const params = new URLSearchParams();
    if (batchId) params.set('batch_id', batchId);
    if (isUsed !== undefined) params.set('is_used', String(isUsed));
    return request(`/redeem-codes?${params.toString()}`);
};

// ========== 用户管理 ==========

export interface AdminUser {
    id: string;
    email: string;
    nickname: string | null;
    credit_balance: number;
    is_admin: boolean;
    is_active: boolean;
    created_at: string;
    total_usage: number;
    last_login_at: string | null;
    last_login_ip: string | null;
    note: string | null;
}

export interface UserListResult {
    users: AdminUser[];
    total: number;
    page: number;
    page_size: number;
}

export const getUsers = async (page: number = 1, search?: string): Promise<UserListResult> => {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    return request(`/users?${params.toString()}`);
};

export const adjustUserCredits = async (userId: string, amount: number, reason?: string): Promise<void> => {
    const params = new URLSearchParams({ amount: String(amount) });
    if (reason) params.set('reason', reason);
    if (reason) params.set('reason', reason);
    return request(`/users/${userId}/credits?${params.toString()}`, { method: 'PUT' });
};

export const updateUserNote = async (userId: string, note: string): Promise<void> => {
    return request(`/users/${userId}/note`, {
        method: 'PUT',
        body: JSON.stringify({ note }),
    });
};

// ========== 统计数据 ==========

export interface DashboardStats {
    total_users: number;
    active_users_today: number;
    total_credits_consumed: number;
    total_requests_today: number;
    token_pool_count: number;
    available_tokens: number;
    today_credits_used: number;
    today_image_calls: number;
    daily_stats: { date: string; total_requests: number; total_credits_used: number; unique_users: number }[];
    model_stats: { model_name: string; total_requests: number; total_credits_used: number }[];
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
    const token = getToken();
    if (!token) throw new Error('请先登录');

    const response = await fetch(`${getBackendUrl()}/api/stats/dashboard`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(error.detail || `HTTP error ${response.status}`);
    }

    return response.json();
};


// ========== 邮箱白名单管理 ==========

export interface EmailWhitelistInfo {
    id: string;
    suffix: string;
    is_active: boolean;
    created_at: string;
}

export const getEmailWhitelist = async (): Promise<EmailWhitelistInfo[]> => {
    return request('/email-whitelist');
};

export const addEmailWhitelist = async (suffix: string): Promise<EmailWhitelistInfo> => {
    return request('/email-whitelist', {
        method: 'POST',
        body: JSON.stringify({ suffix }),
    });
};

export const toggleEmailWhitelist = async (id: string): Promise<{ is_active: boolean }> => {
    return request(`/email-whitelist/${id}`, {
        method: 'PUT',
    });
};

export const deleteEmailWhitelist = async (id: string): Promise<void> => {
    return request(`/email-whitelist/${id}`, {
        method: 'DELETE',
    });
};
