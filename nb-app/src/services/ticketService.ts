/**
 * 工单服务
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

const API_BASE = `${getBackendUrl()}/api/tickets`;

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

export interface TicketMessage {
    id: string;
    sender_id: string;
    content: string;
    is_admin: boolean;
    created_at: string;
    sender_email?: string;
}

export interface Ticket {
    id: string;
    user_id: string;
    title: string;
    status: 'open' | 'pending' | 'resolved' | 'closed';
    priority: 'low' | 'normal' | 'high';
    created_at: string;
    updated_at: string;
    user_email?: string; // Admin view only
    messages?: TicketMessage[]; // Detail view only
}

// User API
export const createTicket = async (title: string, content: string, priority: string = 'normal'): Promise<Ticket> => {
    return request('/', {
        method: 'POST',
        body: JSON.stringify({ title, content, priority }),
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

// Admin API
export const getAllTickets = async (status: string = 'all'): Promise<Ticket[]> => {
    // admin api prefix is slightly different in our router implementation or we used /admin path?
    // Let's check router: get("/admin/all")
    return request(`/admin/all?status_filter=${status}`);
};

export const updateTicketStatus = async (id: string, status?: string, priority?: string): Promise<void> => {
    return request(`/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, priority }),
    });
};
