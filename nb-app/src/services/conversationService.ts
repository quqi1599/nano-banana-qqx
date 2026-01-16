/**
 * 对话历史服务
 */

import { getBackendUrl } from '../utils/backendUrl';
import { buildRequestOptions } from '../utils/request';

const API_BASE = getBackendUrl();
const API_KEY_STORAGE = 'nbnb_api_key';

const VISITOR_ID_STORAGE = 'nbnb_visitor_id';
const CUSTOM_ENDPOINT_STORAGE = 'nbnb_custom_endpoint';

const buildRequestWithAuth = (options: RequestInit = {}): RequestInit => {
    const requestOptions = buildRequestOptions(options);
    const headers = new Headers(requestOptions.headers || {});

    // API KEY 认证
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (apiKey && !headers.has('X-API-Key')) {
        headers.set('X-API-Key', apiKey);
    }

    // 匿名游客标识
    const visitorId = localStorage.getItem(VISITOR_ID_STORAGE);
    if (visitorId && !headers.has('X-Visitor-Id')) {
        headers.set('X-Visitor-Id', visitorId);
    }

    // 自定义中转接口地址
    const customEndpoint = localStorage.getItem(CUSTOM_ENDPOINT_STORAGE);
    if (customEndpoint && !headers.has('X-Custom-Endpoint')) {
        headers.set('X-Custom-Endpoint', customEndpoint);
    }

    return {
        ...requestOptions,
        headers,
    };
};

// 通用请求处理
async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
        ...buildRequestWithAuth(options || {}),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || '请求失败');
    }

    return response.json();
}

async function requestWithMeta<T>(url: string, options?: RequestInit): Promise<{ data: T; total: number | null }> {
    const response = await fetch(`${API_BASE}${url}`, {
        ...buildRequestWithAuth(options || {}),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || '请求失败');
    }

    const totalHeader = response.headers.get('x-total-count');
    const total = totalHeader ? Number(totalHeader) : null;
    const data = await response.json();
    return {
        data,
        total: Number.isFinite(total) ? total : null,
    };
}

// 类型定义
export interface MessageImage {
    base64: string;
    mimeType: string;
}

export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'model';
    content: string;
    images?: MessageImage[];
    is_thought: boolean;
    thinking_duration?: number;
    created_at: string;
}

export interface Conversation {
    id: string;
    user_id: string | null;
    visitor_id: string | null;
    title: string | null;
    model_name: string | null;
    message_count: number;
    created_at: string;
    updated_at: string;
    custom_endpoint: string | null;
}

export interface ConversationDetail extends Conversation {
    messages: ConversationMessage[];
}

export interface ConversationMessagesPage {
    conversation_id: string;
    messages: ConversationMessage[];
    total: number;
    page: number;
    page_size: number;
}

export type AdminUserType = 'user' | 'api_key' | 'visitor';

export interface AdminConversation extends Conversation {
    user_email: string;
    user_nickname: string | null;
    user_type: AdminUserType;
    uses_custom_endpoint: boolean;
}

export interface AdminConversationDetail extends AdminConversation {
    messages: ConversationMessage[];
}

// ============ 管理员对话筛选和统计类型 ============

export interface ConversationFilters {
    user_id?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    model_name?: string;
    min_messages?: number;
    max_messages?: number;
}

export interface ConversationListWithTotal {
    conversations: AdminConversation[];
    total: number;
    page: number;
    page_size: number;
}

export interface UserConversationStats {
    total_conversations: number;
    total_messages: number;
    model_breakdown: Record<string, number>;
    last_activity: string | null;
    most_active_day: string | null;
}

export interface ConversationTimelineItem {
    date: string;
    conversation_count: number;
    message_count: number;
    conversations: AdminConversation[];
}

export interface ConversationTimelineResponse {
    timeline: ConversationTimelineItem[];
    total: number;
    page: number;
    page_size: number;
}

/**
 * 创建新对话
 */
export async function createConversation(title?: string, modelName?: string, customEndpoint?: string): Promise<Conversation> {
    return request<Conversation>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title, model_name: modelName, custom_endpoint: customEndpoint }),
    });
}

/**
 * 获取当前用户的对话列表
 */
export async function getConversations(): Promise<Conversation[]> {
    return request<Conversation[]>('/api/conversations');
}

/**
 * 获取当前用户的对话列表（分页）
 */
export async function getConversationsPage(
    page: number = 1,
    pageSize: number = 20
): Promise<{ conversations: Conversation[]; total: number | null }> {
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
    });
    const { data, total } = await requestWithMeta<Conversation[]>(`/api/conversations?${params}`);
    return { conversations: data, total };
}

/**
 * 获取对话详情
 */
export async function getConversation(id: string): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/api/conversations/${id}`);
}

/**
 * 获取对话消息分页
 */
export async function getConversationMessages(
    conversationId: string,
    page: number = 1,
    pageSize: number = 50
): Promise<ConversationMessagesPage> {
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
    });
    const { data, total } = await requestWithMeta<ConversationMessagesPage>(
        `/api/conversations/${conversationId}/messages?${params}`
    );
    return total !== null ? { ...data, total } : data;
}

/**
 * 添加消息到对话
 */
export async function addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system' | 'model',
    content: string,
    images?: MessageImage[],
    isThought = false,
    thinkingDuration?: number
): Promise<ConversationMessage> {
    return request<ConversationMessage>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
            role,
            content,
            images,
            is_thought: isThought,
            thinking_duration: thinkingDuration,
        }),
    });
}

/**
 * 更新对话标题
 */
export async function updateConversationTitle(id: string, title: string): Promise<Conversation> {
    return request<Conversation>(`/api/conversations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title }),
    });
}

/**
 * 删除对话
 */
export async function deleteConversation(id: string): Promise<void> {
    return request<void>(`/api/conversations/${id}`, {
        method: 'DELETE',
    });
}

/**
 * 清空对话消息
 */
export async function clearConversationMessages(id: string): Promise<void> {
    return request<void>(`/api/conversations/${id}/messages`, {
        method: 'DELETE',
    });
}

// ============ 管理员 API ============

/**
 * 管理员获取所有对话列表
 */
export async function adminGetConversations(
    userId?: string,
    search?: string,
    page = 1,
    pageSize = 20
): Promise<AdminConversation[]> {
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
    });
    if (userId) params.append('user_id', userId);
    if (search) params.append('search', search);

    return request<AdminConversation[]>(`/api/admin/conversations?${params}`);
}

/**
 * 管理员获取对话详情
 */
export async function adminGetConversation(id: string): Promise<AdminConversationDetail> {
    return request<AdminConversationDetail>(`/api/admin/conversations/${id}`);
}

/**
 * 管理员删除对话
 */
export async function adminDeleteConversation(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/admin/conversations/${id}`, {
        method: 'DELETE',
    });
}

/**
 * 管理员获取对话列表（带筛选和总数）
 */
export async function adminGetConversationsFiltered(
    filters: ConversationFilters,
    page = 1,
    pageSize = 20
): Promise<ConversationListWithTotal> {
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
    });
    if (filters.user_id) params.append('user_id', filters.user_id);
    if (filters.search) params.append('search', filters.search);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.model_name) params.append('model_name', filters.model_name);
    if (filters.min_messages !== undefined) params.append('min_messages', String(filters.min_messages));
    if (filters.max_messages !== undefined) params.append('max_messages', String(filters.max_messages));

    return request<ConversationListWithTotal>(`/api/admin/conversations?${params}`);
}

/**
 * 管理员获取用户对话统计
 */
export async function adminGetUserConversationStats(userId: string): Promise<UserConversationStats> {
    return request<UserConversationStats>(`/api/admin/users/${userId}/conversation-stats`);
}

/**
 * 管理员获取用户对话时间线
 */
export async function adminGetUserConversationTimeline(
    userId: string,
    page = 1,
    pageSize = 30
): Promise<ConversationTimelineResponse> {
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
    });
    return request<ConversationTimelineResponse>(`/api/admin/users/${userId}/conversation-timeline?${params}`);
}
