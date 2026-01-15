/**
 * 支付系统服务
 */
import { getToken } from './authService';
import { getBackendUrl } from '../utils/backendUrl';

const API_BASE = `${getBackendUrl()}/api/payment`;

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

// ========== 类型定义 ==========

export type PaymentMethod = 'usdt_trc20' | 'usdt_erc20' | 'usdt_bep20';
export type OrderStatus = 'pending' | 'processing' | 'paid' | 'cancelled' | 'expired' | 'failed';

export interface PaymentPlan {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    price_usd: number;
    is_active: boolean;
    sort_order: number;
    is_popular: boolean;
    created_at: string;
}

export interface PaymentOrder {
    id: string;
    trade_no: string;
    plan_id: string;
    amount: number;
    credits: number;
    payment_method: string;
    status: OrderStatus;
    wallet_address: string | null;
    expected_amount: number | null;
    network: string | null;
    paid_at: string | null;
    expires_at: string | null;
    created_at: string;
}

export interface OrderDetail extends PaymentOrder {
    plan?: PaymentPlan;
    tx_hash?: string | null;
    confirmations: number;
    received_amount?: number | null;
}

export interface UsdtPaymentInfo {
    wallet_address: string;
    network: string;
    expected_amount: number;
    qr_code_url?: string;
    exchange_rate: number;
    expires_at: string;
}

export interface PaymentMethodConfig {
    method: PaymentMethod;
    name: string;
    icon?: string;
    enabled: boolean;
    min_amount: number;
    max_amount: number;
    description: string;
}

// ========== 套餐相关 ==========

export const getPaymentPlans = async (activeOnly: boolean = true): Promise<PaymentPlan[]> => {
    return request(`/plans?active_only=${activeOnly}`);
};

export const getPaymentPlan = async (planId: string): Promise<PaymentPlan> => {
    return request(`/plans/${planId}`);
};

// ========== 订单相关 ==========

export interface CreateOrderRequest {
    plan_id: string;
    payment_method: PaymentMethod;
}

export const createOrder = async (data: CreateOrderRequest): Promise<PaymentOrder> => {
    return request('/orders/create', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

export const getOrderDetail = async (tradeNo: string): Promise<OrderDetail> => {
    return request(`/orders/${tradeNo}`);
};

export const getMyOrders = async (
    page: number = 1,
    statusFilter?: string
): Promise<PaymentOrder[]> => {
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set('status_filter', statusFilter);
    return request(`/orders?${params.toString()}`);
};

export const cancelOrder = async (tradeNo: string): Promise<{ message: string }> => {
    return request(`/orders/${tradeNo}/cancel`, {
        method: 'POST',
    });
};

export const getPaymentInfo = async (tradeNo: string): Promise<UsdtPaymentInfo> => {
    return request(`/orders/${tradeNo}/payment-info`);
};

// ========== 汇率相关 ==========

export interface ExchangeRate {
    usdt_usd: number;
    updated_at: string;
}

export const getExchangeRate = async (): Promise<ExchangeRate> => {
    return request('/exchange-rate');
};

// ========== 支付方式配置 ==========

export const getPaymentMethods = async (): Promise<PaymentMethodConfig[]> => {
    return request('/payment-methods');
};

// ========== 轮询支付状态 ==========

export const pollOrderStatus = async (
    tradeNo: string,
    onStatusChange: (order: OrderDetail) => void,
    interval: number = 5000,
    maxAttempts: number = 60
): Promise<void> => {
    let attempts = 0;

    const poll = async (): Promise<void> => {
        attempts++;

        try {
            const order = await getOrderDetail(tradeNo);
            onStatusChange(order);

            // 如果订单已完成或失败，停止轮询
            if (order.status === 'paid' || order.status === 'cancelled' || order.status === 'expired' || order.status === 'failed') {
                return;
            }

            // 继续轮询
            if (attempts < maxAttempts) {
                setTimeout(poll, interval);
            }
        } catch (error) {
            console.error('轮询订单状态失败:', error);
            // 继续轮询
            if (attempts < maxAttempts) {
                setTimeout(poll, interval);
            }
        }
    };

    poll();
};

// ========== 格式化工具 ==========

export const formatOrderStatus = (status: OrderStatus): string => {
    const statusMap: Record<OrderStatus, string> = {
        pending: '待支付',
        processing: '处理中',
        paid: '已支付',
        cancelled: '已取消',
        expired: '已过期',
        failed: '支付失败',
    };
    return statusMap[status] || status;
};

export const formatPaymentMethod = (method: PaymentMethod): string => {
    const methodMap: Record<PaymentMethod, string> = {
        usdt_trc20: 'USDT (TRC20)',
        usdt_erc20: 'USDT (ERC20)',
        usdt_bep20: 'USDT (BEP20)',
    };
    return methodMap[method] || method;
};

export const getPaymentMethodIcon = (method: PaymentMethod): string => {
    // 返回对应链的图标 URL
    const iconMap: Record<PaymentMethod, string> = {
        usdt_trc20: '/icons/tron-trc20.svg',
        usdt_erc20: '/icons/ethereum-erc20.svg',
        usdt_bep20: '/icons/bsc-bep20.svg',
    };
    return iconMap[method] || '/icons/usdt.svg';
};

// 倒计时计算
export const getTimeRemaining = (expiresAt: string): number => {
    const now = Date.now();
    const expires = new Date(expiresAt).getTime();
    return Math.max(0, expires - now);
};

// 格式化倒计时
export const formatTimeRemaining = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
