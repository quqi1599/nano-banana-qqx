/**
 * 管理员后台服务
 */

import { getBackendUrl } from '../utils/backendUrl';
import { buildRequestOptions } from '../utils/request';

const API_BASE = `${getBackendUrl()}/api/admin`;
const QUEUE_REQUEST_TIMEOUT_MS = 10000;

type RequestOptions = RequestInit & {
    timeoutMs?: number;
};

// 通用请求
const request = async <T>(endpoint: string, options: RequestOptions = {}): Promise<T> => {
    const { timeoutMs, signal, ...fetchOptions } = options;
    if (!timeoutMs) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...buildRequestOptions(fetchOptions),
            signal,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: '请求失败' }));
            throw new Error(error.detail || `HTTP error ${response.status}`);
        }

        return response.json();
    }

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let didTimeout = false;
    const handleAbort = () => controller.abort();

    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener('abort', handleAbort, { once: true });
        }
    }

    timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
    }, timeoutMs);

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...buildRequestOptions(fetchOptions),
            signal: controller.signal,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: '请求失败' }));
            throw new Error(error.detail || `HTTP error ${response.status}`);
        }

        return response.json();
    } catch (error) {
        if (controller.signal.aborted) {
            if (didTimeout) {
                throw new Error('请求超时');
            }
            throw new Error('请求已取消');
        }
        throw error;
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        if (signal) {
            signal.removeEventListener('abort', handleAbort);
        }
    }
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

// ============================================================================
// 批量刷新 Token 额度
// ============================================================================
export interface TokenRefreshResult {
    token_id: string;
    token_name: string;
    success: boolean;
    remaining_quota?: number;
    error?: string;
}

export interface RefreshAllTokensResult {
    success_count: number;
    failure_count: number;
    total_count: number;
    results: TokenRefreshResult[];
    message: string;
}

/**
 * 一键刷新所有启用 Token 的额度
 * 并发查询所有 Token 的余额，返回详细结果
 */
export const refreshAllTokensQuota = async (): Promise<RefreshAllTokensResult> => {
    return request('/tokens/refresh-all-quota', { method: 'POST' });
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

export const deleteRedeemCode = async (codeId: string): Promise<{ message: string }> => {
    return request(`/redeem-codes/${codeId}`, { method: 'DELETE' });
};

export const deleteUsedRedeemCodes = async (): Promise<{ message: string; deleted_count: number }> => {
    return request('/redeem-codes/batch/used', { method: 'DELETE' });
};

export const deleteUnusedRedeemCodes = async (): Promise<{ message: string; deleted_count: number }> => {
    return request('/redeem-codes/batch/unused', { method: 'DELETE' });
};

export const deleteAllRedeemCodes = async (): Promise<{ message: string; deleted_count: number }> => {
    return request('/redeem-codes/batch/all', { method: 'DELETE' });
};

// ========== 用户管理 ==========

export interface AdminUser {
    id: string;
    email: string;
    nickname: string | null;
    credit_balance: number;
    pro3_balance: number;
    flash_balance: number;
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
    tags?: string[];
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
    if (filters.tags && filters.tags.length > 0) {
        filters.tags.forEach(tag => params.append('tags', tag));
    }
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
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.is_admin !== undefined) params.set('is_admin', String(filters.is_admin));
    if (filters.is_active !== undefined) params.set('is_active', String(filters.is_active));
    if (filters.min_balance !== undefined) params.set('min_balance', String(filters.min_balance));
    if (filters.max_balance !== undefined) params.set('max_balance', String(filters.max_balance));
    if (filters.created_after) params.set('created_after', filters.created_after);
    if (filters.created_before) params.set('created_before', filters.created_before);

    const query = params.toString();
    const response = await fetch(
        `${API_BASE}/users/export${query ? `?${query}` : ''}`,
        buildRequestOptions()
    );

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

export const adjustUserCredits = async (
    userId: string,
    amount: number,
    reason?: string
): Promise<{ message: string; new_balance: number }> => {
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

// 创建用户
export interface CreateUserRequest {
    email: string;
    password: string;
    nickname?: string;
    credit_balance?: number;
    pro3_balance?: number;
    flash_balance?: number;
    is_admin?: boolean;
    note?: string;
    tags?: string[];
}

export const createUser = async (data: CreateUserRequest): Promise<AdminUser> => {
    return request('/users', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// 修改用户密码
export const changeUserPassword = async (userId: string, newPassword: string): Promise<{ message: string }> => {
    return request(`/users/${userId}/password`, {
        method: 'PUT',
        body: JSON.stringify({ new_password: newPassword }),
    });
};

// 调整用户积分（支持 pro3 和 flash）
export interface AdjustUserCreditsOptions {
    userId: string;
    amount: number;
    reason?: string;
    type?: 'credit' | 'pro3' | 'flash';
}

export const adjustUserBalance = async (options: AdjustUserCreditsOptions): Promise<{ message: string; new_balance: number }> => {
    const { userId, amount, reason = '管理员调整', type = 'credit' } = options;
    const params = new URLSearchParams({ amount: String(amount), reason, type });
    return request(`/users/${userId}/credits?${params.toString()}`, { method: 'PUT' });
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

    const response = await fetch(
        `${getBackendUrl()}/api/stats/dashboard${query ? `?${query}` : ''}`,
        buildRequestOptions()
    );

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
    const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        data_type: dataType,
    });

    const response = await fetch(
        `${getBackendUrl()}/api/stats/export?${params.toString()}`,
        buildRequestOptions()
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '导出失败' }));
        throw new Error(error.detail || `HTTP error ${response.status}`);
    }

    return response.blob();
};


// ========== 安全监控 ==========

export interface LoginFailureItem {
    ip: string;
    count: number;
    last_seen: string | null;
    last_email: string | null;
    ttl_seconds: number | null;
}

export interface LoginFailureResult {
    items: LoginFailureItem[];
    total: number;
}

export const getLoginFailureIps = async (limit: number = 50): Promise<LoginFailureResult> => {
    const params = new URLSearchParams({ limit: String(limit) });
    return request(`/security/login-failures?${params.toString()}`);
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

// ========== 通知邮箱管理 ==========

export interface NotificationEmailInfo {
    id: string;
    email: string;
    remark: string | null;
    is_active: boolean;
    created_at: string;
}

export const getNotificationEmails = async (): Promise<NotificationEmailInfo[]> => {
    return request('/notification-emails');
};

export const addNotificationEmail = async (email: string, remark?: string): Promise<NotificationEmailInfo> => {
    return request('/notification-emails', {
        method: 'POST',
        body: JSON.stringify({ email, remark }),
    });
};

export const deleteNotificationEmail = async (id: string): Promise<{ message: string }> => {
    return request(`/notification-emails/${id}`, {
        method: 'DELETE',
    });
};

export const toggleNotificationEmail = async (id: string): Promise<{ message: string; is_active: boolean }> => {
    return request(`/notification-emails/${id}/toggle`, {
        method: 'PUT',
    });
};

// ========== 队列监控管理 ==========

export interface QueueStats {
    queues: Record<string, number>;
    workers: {
        count: number;
        [key: string]: unknown;
    };
    tasks: {
        pending: number;
        active: number;
        failed: number;
        succeeded: number;
    };
    timestamp: string;
}

export interface WorkerInfo {
    name: string;
    status: string;
    active_tasks?: number;
}

export interface WorkersResponse {
    workers: WorkerInfo[];
    total: number;
    online: number;
    timestamp: string;
}

export interface TaskInfo {
    id: string;
    name: string;
    args?: unknown[];
    kwargs?: Record<string, unknown>;
    queue?: string;
    worker?: string;
    time_start?: number;
    time_received?: number;
    time_done?: number;
    time_retry?: number;
    duration?: number;
    retries?: number;
    retry_task_id?: string;
    retry_requested_at?: number;
    status: 'pending' | 'active' | 'failed' | 'succeeded' | 'revoked';
    result?: unknown;
    error?: string;
    traceback?: string;
}

export interface TasksResponse {
    tasks: TaskInfo[];
    total: number;
    queue?: string;
    status?: string;
}

export interface TaskDetail {
    id: string;
    status: string;
    result?: unknown;
    error?: string;
    traceback?: string;
    backend: string;
    name?: string;
    queue?: string;
    worker?: string;
    args?: unknown[];
    kwargs?: Record<string, unknown>;
    time_start?: number;
    time_done?: number;
    duration?: number;
    retries?: number;
}

export interface DashboardData {
    overview: {
        queues: Record<string, number>;
        workers: {
            total: number;
            online: number;
        };
        tasks: {
            pending: number;
            active: number;
            failed: number;
            succeeded: number;
        };
    };
    recent_tasks: TaskInfo[];
    workers: Array<{ name: string; active_tasks: number }>;
    throughput: {
        last_hour: number;
        last_day: number;
    };
    timestamp: string;
}

// 获取队列统计
export const getQueueStats = async (): Promise<QueueStats> => {
    return request('/queue/stats', { timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// 获取 Worker 列表
export const getQueueWorkers = async (): Promise<WorkersResponse> => {
    return request('/queue/workers', { timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// 获取任务列表
export const getQueueTasks = async (params: {
    queue?: string;
    status?: string;
    limit?: number;
    offset?: number;
} = {}): Promise<TasksResponse> => {
    const queryParams = new URLSearchParams();
    if (params.queue) queryParams.set('queue', params.queue);
    if (params.status) queryParams.set('status', params.status);
    if (params.limit) queryParams.set('limit', String(params.limit));
    if (params.offset) queryParams.set('offset', String(params.offset));
    const query = queryParams.toString();
    return request(`/queue/tasks${query ? `?${query}` : ''}`, { timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// 获取任务详情
export const getTaskDetail = async (taskId: string): Promise<TaskDetail> => {
    return request(`/queue/tasks/${taskId}`, { timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// 重试失败任务
export const retryTask = async (taskId: string): Promise<{ id: string; status: string; message: string }> => {
    return request(`/queue/tasks/${taskId}/retry`, { method: 'POST', timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// 取消/删除任务
export const cancelTask = async (taskId: string): Promise<{ id: string; status: string; message: string }> => {
    return request(`/queue/tasks/${taskId}`, { method: 'DELETE', timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// 清空队列
export const purgeQueue = async (queue: string): Promise<{ queue: string; purged_count: number; message: string }> => {
    return request(`/queue/purge?queue=${encodeURIComponent(queue)}`, { method: 'POST', timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// 重启 Worker 进程池
export const restartWorkers = async (): Promise<{ status: string; message: string }> => {
    return request('/queue/workers/pool_restart', { method: 'POST', timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// 获取仪表板数据
export const getQueueDashboard = async (): Promise<DashboardData> => {
    return request('/queue/dashboard', { timeoutMs: QUEUE_REQUEST_TIMEOUT_MS });
};

// ========== 邮件配置 ==========

export interface ProviderInfo {
    id: string;
    name: string;
    smtp_host: string | null;
    smtp_port: number | null;
    encryption: string | null;
    api_url: string | null;
}

export interface SmtpConfigBase {
    name: string;
    provider: string;
    provider_name?: string;
    smtp_host?: string | null;
    smtp_port?: number | null;
    smtp_encryption: string;
    smtp_user?: string | null;
    smtp_password?: string | null;
    from_email?: string | null;
    from_name: string;
    reply_to?: string | null;
    api_key?: string | null;
    api_url?: string | null;
    is_enabled: boolean;
    is_default: boolean;
    daily_limit?: number | null;
    hourly_limit?: number | null;
    description?: string | null;
}

export interface SmtpConfigRequired {
    name: string;
    provider: string;
    smtp_encryption: string;
    from_name: string;
    is_enabled: boolean;
    is_default: boolean;
}

export interface SmtpConfigInfo extends SmtpConfigBase {
    id: string;
    provider_name: string;
    smtp_host: string;
    smtp_port: number;
    smtp_user: string | null;
    smtp_password: string | null;
    from_email: string | null;
    reply_to: string | null;
    api_key: string | null;
    api_url: string | null;
    daily_limit: number | null;
    hourly_limit: number | null;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export interface EmailSettingsSummary {
    total_configs: number;
    enabled_configs: number;
    default_config: SmtpConfigInfo | null;
    providers: ProviderInfo[];
}

export type SmtpConfigCreate = Partial<SmtpConfigBase> & SmtpConfigRequired;

export interface SmtpConfigUpdate extends Partial<SmtpConfigBase> { }

// 邮件配置使用不同的 API 基础路径
const emailRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${getBackendUrl()}/api/admin/email-settings${endpoint}`, {
        ...buildRequestOptions(options),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(error.detail || `HTTP error ${response.status}`);
    }

    return response.json();
};

// 获取支持的邮件提供商
export const getEmailProviders = async (): Promise<ProviderInfo[]> => {
    return emailRequest('/providers');
};

// 获取所有邮件配置
export const getEmailConfigs = async (enabledOnly: boolean = false): Promise<SmtpConfigInfo[]> => {
    return emailRequest(`/configs?enabled_only=${enabledOnly}`);
};

// 获取邮件配置概要
export const getEmailSettingsSummary = async (): Promise<EmailSettingsSummary> => {
    return emailRequest('/configs/summary');
};

// 获取单个邮件配置
export const getEmailConfig = async (configId: string): Promise<SmtpConfigInfo> => {
    return emailRequest(`/configs/${configId}`);
};

// 创建邮件配置
export const createEmailConfig = async (data: SmtpConfigCreate): Promise<SmtpConfigInfo> => {
    return emailRequest('/configs', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// 更新邮件配置
export const updateEmailConfig = async (configId: string, data: SmtpConfigUpdate): Promise<SmtpConfigInfo> => {
    return emailRequest(`/configs/${configId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

// 删除邮件配置
export const deleteEmailConfig = async (configId: string): Promise<{ message: string }> => {
    return emailRequest(`/configs/${configId}`, { method: 'DELETE' });
};

// 设置默认邮件配置
export const setDefaultEmailConfig = async (configId: string): Promise<{ message: string }> => {
    return emailRequest(`/configs/${configId}/set-default`, { method: 'POST' });
};

// 切换邮件配置启用状态
export const toggleEmailConfig = async (configId: string): Promise<{ message: string; is_enabled: boolean }> => {
    return emailRequest(`/configs/${configId}/toggle`, { method: 'POST' });
};

// 发送测试邮件
export interface TestEmailResult {
    success: boolean;
    message: string;
    error_type?: string;
    details?: {
        connection?: {
            host: string;
            port: number;
            encryption: string;
            from: string;
            to: string;
        };
        provider?: string;
        timestamp?: string;
        hint?: string;
        status_code?: number;
    };
}

export const testSendEmail = async (configId: string | null, testEmail: string): Promise<TestEmailResult> => {
    const payload = {
        config_id: configId && configId.trim() ? configId : null,
        test_email: testEmail,
    };
    return emailRequest('/test-send', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

// ========== 游客（未登录用户）管理 ==========

export interface VisitorInfo {
    id: string;
    visitor_id: string;
    custom_endpoint: string | null;
    conversation_count: number;
    message_count: number;
    image_count: number;
    first_seen: string;
    last_seen: string;
}

export interface VisitorListResult {
    visitors: VisitorInfo[];
    total: number;
    page: number;
    page_size: number;
}

export interface VisitorFilters {
    search?: string;
    endpoint?: string;
    min_conversations?: number;
    min_messages?: number;
    min_images?: number;
    first_seen_after?: string;
    first_seen_before?: string;
}

export interface VisitorStats {
    total_visitors: number;
    total_conversations: number;
    total_messages: number;
    total_images: number;
    top_endpoints: { endpoint: string; count: number }[];
}

export interface VisitorDetail extends VisitorInfo {
    conversations: Array<{
        id: string;
        title: string | null;
        message_count: number;
        model_name: string | null;
        created_at: string;
        updated_at: string;
    }>;
}

// 获取游客列表
export const getVisitors = async (page: number = 1, filters: VisitorFilters = {}): Promise<VisitorListResult> => {
    const params = new URLSearchParams({ page: String(page) });
    if (filters.search) params.set('search', filters.search);
    if (filters.endpoint) params.set('endpoint', filters.endpoint);
    if (filters.min_conversations !== undefined) params.set('min_conversations', String(filters.min_conversations));
    if (filters.min_messages !== undefined) params.set('min_messages', String(filters.min_messages));
    if (filters.min_images !== undefined) params.set('min_images', String(filters.min_images));
    if (filters.first_seen_after) params.set('first_seen_after', filters.first_seen_after);
    if (filters.first_seen_before) params.set('first_seen_before', filters.first_seen_before);
    return request(`/visitors?${params.toString()}`);
};

// 获取游客统计
export const getVisitorStats = async (): Promise<VisitorStats> => {
    return request('/visitors/stats');
};

// 获取游客详情
export const getVisitorDetail = async (visitorId: string): Promise<VisitorDetail> => {
    return request(`/visitors/${visitorId}`);
};

// 删除游客
export const deleteVisitor = async (visitorId: string): Promise<{ message: string }> => {
    return request(`/visitors/${visitorId}`, { method: 'DELETE' });
};
