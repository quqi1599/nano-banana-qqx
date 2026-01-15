/**
 * 管理员后台服务
 */

import { getToken } from './authService';
import { getBackendUrl } from '../utils/backendUrl';

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
    failure_count?: number;
    cooldown_until?: string | null;
    last_failure_at?: string | null;
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
    remark?: string | null;
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
    remark?: string | null;
}

export const generateRedeemCodes = async (
    count: number,
    creditAmount: number,
    pro3Credits: number,
    flashCredits: number,
    expiresDays?: number,
    remark?: string
): Promise<GenerateCodesResult> => {
    return request('/redeem-codes/generate', {
        method: 'POST',
        body: JSON.stringify({
            count,
            credit_amount: creditAmount,
            pro3_credits: pro3Credits,
            flash_credits: flashCredits,
            expires_days: expiresDays,
            remark,
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
    tags: string[];
}

export interface UserListResult {
    users: AdminUser[];
    total: number;
    page: number;
    page_size: number;
}

// 高级筛选参数接口
export interface UserFilters {
    search?: string;
    is_admin?: boolean;
    is_active?: boolean;
    min_balance?: number;
    max_balance?: number;
    created_after?: string;
    created_before?: string;
    login_after?: string;
    login_before?: string;
}

export const getUsers = async (page: number = 1, search?: string): Promise<UserListResult> => {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    return request(`/users?${params.toString()}`);
};

// 高级筛选获取用户列表
export const getUsersAdvanced = async (page: number = 1, filters: UserFilters = {}): Promise<UserListResult> => {
    const params = new URLSearchParams({ page: String(page) });
    if (filters.search) params.set('search', filters.search);
    if (filters.is_admin !== undefined) params.set('is_admin', String(filters.is_admin));
    if (filters.is_active !== undefined) params.set('is_active', String(filters.is_active));
    if (filters.min_balance !== undefined) params.set('min_balance', String(filters.min_balance));
    if (filters.max_balance !== undefined) params.set('max_balance', String(filters.max_balance));
    if (filters.created_after) params.set('created_after', filters.created_after);
    if (filters.created_before) params.set('created_before', filters.created_before);
    if (filters.login_after) params.set('login_after', filters.login_after);
    if (filters.login_before) params.set('login_before', filters.login_before);
    return request(`/users?${params.toString()}`);
};

// 用户统计概览
export interface UserStats {
    total_users: number;
    new_today: number;
    disabled_count: number;
    paid_users: number;
}

export const getUsersStats = async (): Promise<UserStats> => {
    return request('/users/stats');
};

// 用户状态管理
export const setUserActiveStatus = async (userId: string, isActive: boolean, reason: string): Promise<{ message: string; user_id: string; is_active: boolean }> => {
    return request(`/users/${userId}/active`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: isActive, reason }),
    });
};

export interface AdminActionConfirmResult {
    confirm_token: string;
    expires_in: number;
}

export const requestAdminActionConfirmation = async (
    purpose: 'batch_status' | 'batch_credits',
    password: string
): Promise<AdminActionConfirmResult> => {
    return request('/confirm-action', {
        method: 'POST',
        body: JSON.stringify({ purpose, password }),
    });
};

// 批量状态更新
export const batchUpdateUserStatus = async (
    userIds: string[],
    isActive: boolean,
    reason: string,
    confirmToken: string
): Promise<{ message: string; updated_count: number }> => {
    return request('/users/batch/status', {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds, is_active: isActive, reason, confirm_token: confirmToken }),
    });
};

// 批量积分调整
export const batchAdjustCredits = async (
    userIds: string[],
    amount: number,
    reason: string,
    confirmToken: string
): Promise<{ message: string; updated_count: number }> => {
    return request('/users/batch/credits', {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds, amount, reason, confirm_token: confirmToken }),
    });
};

// 积分调整历史
export interface CreditHistoryItem {
    id: string;
    amount: number;
    type: string;
    description: string | null;
    balance_after: number;
    created_at: string;
}

export interface CreditHistoryResult {
    items: CreditHistoryItem[];
    total: number;
}

export const getUserCreditHistory = async (
    userId: string,
    options: number | { limit?: number; page?: number; pageSize?: number } = 3
): Promise<CreditHistoryResult> => {
    const params = new URLSearchParams();
    if (typeof options === 'number') {
        params.set('limit', String(options));
    } else {
        if (options.limit !== undefined) params.set('limit', String(options.limit));
        if (options.page !== undefined) params.set('page', String(options.page));
        if (options.pageSize !== undefined) params.set('page_size', String(options.pageSize));
    }
    return request(`/users/${userId}/credit-history?${params.toString()}`);
};

export interface UsageLogItem {
    id: string;
    model_name: string;
    credits_used: number;
    request_type: string;
    prompt_preview: string | null;
    is_success: boolean;
    error_message: string | null;
    created_at: string;
}

export interface UsageLogResult {
    items: UsageLogItem[];
    total: number;
    page: number;
    page_size: number;
}

export const getUserUsageLogs = async (
    userId: string,
    page: number = 1,
    pageSize: number = 20
): Promise<UsageLogResult> => {
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
    });
    return request(`/users/${userId}/usage-logs?${params.toString()}`);
};

// 导出用户数据
export const exportUsers = async (filters: UserFilters = {}): Promise<void> => {
    const token = getToken();
    if (!token) throw new Error('请先登录');

    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.is_admin !== undefined) params.set('is_admin', String(filters.is_admin));
    if (filters.is_active !== undefined) params.set('is_active', String(filters.is_active));
    if (filters.min_balance !== undefined) params.set('min_balance', String(filters.min_balance));
    if (filters.max_balance !== undefined) params.set('max_balance', String(filters.max_balance));
    if (filters.created_after) params.set('created_after', filters.created_after);
    if (filters.created_before) params.set('created_before', filters.created_before);

    const query = params.toString();
    const response = await fetch(`${API_BASE}/users/export${query ? `?${query}` : ''}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '导出失败' }));
        throw new Error(error.detail || `HTTP error ${response.status}`);
    }

    // 下载文件
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const adjustUserCredits = async (userId: string, amount: number, reason?: string): Promise<void> => {
    const params = new URLSearchParams({ amount: String(amount) });
    if (reason) params.set('reason', reason);
    return request(`/users/${userId}/credits?${params.toString()}`, { method: 'PUT' });
};

export const updateUserNote = async (userId: string, note: string): Promise<void> => {
    return request(`/users/${userId}/note`, {
        method: 'PUT',
        body: JSON.stringify({ note }),
    });
};

// 用户标签管理
export interface UserTagsResponse {
    tags: string[];
    counts: Record<string, number>;
}

export const getUserTags = async (): Promise<UserTagsResponse> => {
    return request('/users/tags');
};

export const updateUserTags = async (userId: string, tags: string[]): Promise<{ message: string; tags: string[] }> => {
    return request(`/users/${userId}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tags }),
    });
};

// ========== 统计数据 ==========

export interface UserGrowthStats {
    date: string;
    new_users: number;
    total_users: number;
}

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
    user_growth: UserGrowthStats[];
}

export interface DashboardStatsOptions {
    includeDailyStats?: boolean;
    includeModelStats?: boolean;
}

export const getDashboardStats = async (
    startDate?: string,
    endDate?: string,
    options: DashboardStatsOptions = {}
): Promise<DashboardStats> => {
    const token = getToken();
    if (!token) throw new Error('请先登录');

    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (options.includeDailyStats !== undefined) {
        params.set('include_daily_stats', String(options.includeDailyStats));
    }
    if (options.includeModelStats !== undefined) {
        params.set('include_model_stats', String(options.includeModelStats));
    }
    const query = params.toString();

    const response = await fetch(`${getBackendUrl()}/api/stats/dashboard${query ? `?${query}` : ''}`, {
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

export const exportStats = async (
    startDate: string,
    endDate: string,
    dataType: 'daily' | 'model' | 'user_growth' = 'daily'
): Promise<Blob> => {
    const token = getToken();
    if (!token) throw new Error('请先登录');

    const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        data_type: dataType,
    });

    const response = await fetch(`${getBackendUrl()}/api/stats/export?${params.toString()}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '导出失败' }));
        throw new Error(error.detail || `HTTP error ${response.status}`);
    }

    return response.blob();
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
