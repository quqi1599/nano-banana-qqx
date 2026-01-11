/**
 * 对话历史服务
 */

import { getBackendUrl } from '../utils/backendUrl';
import { getToken } from './authService';

const API_BASE = getBackendUrl();

// 获取认证头
function getAuthHeaders(): HeadersInit {
    const token = getToken();
    return {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
    };
}

// 通用请求处理
async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || '请求失败');
    }

    return response.json();
}

// 类型定义
export interface MessageImage {
    base64: string;
    mimeType: string;
}

export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: MessageImage[];
    is_thought: boolean;
    thinking_duration?: number;
    created_at: string;
}

export interface Conversation {
    id: string;
    user_id: string;
    title: string | null;
    model_name: string | null;
    message_count: number;
    created_at: string;
    updated_at: string;
}

export interface ConversationDetail extends Conversation {
    messages: ConversationMessage[];
}

export interface AdminConversation extends Conversation {
    user_email: string;
    user_nickname: string | null;
}

export interface AdminConversationDetail extends AdminConversation {
    messages: ConversationMessage[];
}

/**
 * 创建新对话
 */
export async function createConversation(title?: string, modelName?: string): Promise<Conversation> {
    return request<Conversation>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title, model_name: modelName }),
    });
}

/**
 * 获取当前用户的对话列表
 */
export async function getConversations(): Promise<Conversation[]> {
    return request<Conversation[]>('/api/conversations');
}

/**
 * 获取对话详情
 */
export async function getConversation(id: string): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/api/conversations/${id}`);
}

/**
 * 添加消息到对话
 */
export async function addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
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
