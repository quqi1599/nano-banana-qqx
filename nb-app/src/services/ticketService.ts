/**
 * 工单服务
 */

import { getBackendUrl } from '../utils/backendUrl';
import { buildRequestOptions } from '../utils/request';

const API_BASE = `${getBackendUrl()}/api/tickets`;

// 通用请求
const request = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...buildRequestOptions(options),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(error.detail || `HTTP error ${response.status}`);
    }

    return response.json();
};

export interface TicketMessage {
    id: string;
    sender_id: string;
    content: string;
    is_admin: boolean;
    created_at: string;
    sender_email?: string;
}

export type TicketCategory = 'bug' | 'feature' | 'billing' | 'account' | 'technical' | 'other';
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high';

// 工单状态配置
export const TICKET_STATUS_LABELS: Record<TicketStatus, { label: string; color: string }> = {
    open: { label: '待处理', color: 'bg-green-100 text-green-600' },
    pending: { label: '待回复', color: 'bg-amber-100 text-amber-600' },
    resolved: { label: '已解决', color: 'bg-blue-100 text-blue-600' },
    closed: { label: '已关闭', color: 'bg-gray-100 text-gray-400' },
};

export interface Ticket {
    id: string;
    user_id: string;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    category: TicketCategory;
    created_at: string;
    updated_at: string;
    user_email?: string; // Admin view only
    messages?: TicketMessage[]; // Detail view only
}

// 工单分类配置
export const TICKET_CATEGORIES: Record<TicketCategory, { label: string; color: string; icon: string }> = {
    bug: { label: 'Bug反馈', color: 'bg-red-100 text-red-600', icon: '🐛' },
    feature: { label: '功能建议', color: 'bg-purple-100 text-purple-600', icon: '💡' },
    billing: { label: '计费问题', color: 'bg-amber-100 text-amber-600', icon: '💰' },
    account: { label: '账号问题', color: 'bg-blue-100 text-blue-600', icon: '👤' },
    technical: { label: '技术支持', color: 'bg-green-100 text-green-600', icon: '🔧' },
    other: { label: '其他', color: 'bg-gray-100 text-gray-600', icon: '📋' },
};

// User API
export const createTicket = async (title: string, content: string, priority: string = 'normal', category: string = 'other'): Promise<Ticket> => {
    return request('/', {
        method: 'POST',
        body: JSON.stringify({ title, content, priority, category }),
    });
};

export const getMyTickets = async (): Promise<Ticket[]> => {
    return request('/');
};

export const getTicketDetail = async (id: string): Promise<Ticket> => {
    return request(`/${id}`);
};

export const replyTicket = async (id: string, content: string): Promise<void> => {
    return request(`/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ content }),
    });
};

export const closeTicket = async (id: string): Promise<{ status: string; message: string }> => {
    return request(`/${id}/close`, {
        method: 'POST',
    });
};

// Admin API
export const getAllTickets = async (status: string = 'all', category: string = 'all'): Promise<Ticket[]> => {
    const params = new URLSearchParams();
    if (status !== 'all') params.append('status_filter', status);
    if (category !== 'all') params.append('category_filter', category);
    return request(`/admin/all?${params.toString()}`);
};

export const updateTicketStatus = async (id: string, status?: string, priority?: string, category?: string): Promise<void> => {
    return request(`/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, priority, category }),
    });
};

// 获取用户未读消息数量
export const getUnreadCount = async (): Promise<{ unread_count: number }> => {
    return request('/unread-count');
};

// 获取管理员未读消息数量
export const getAdminUnreadCount = async (): Promise<{ unread_count: number }> => {
    return request('/admin/unread-count');
};

// 标记工单为已读
export const markTicketRead = async (id: string): Promise<{ status: string }> => {
    return request(`/mark-read/${id}`);
};
