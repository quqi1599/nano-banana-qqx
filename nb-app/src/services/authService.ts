/**
 * 认证服务 - 处理用户注册、登录、Token 管理
 */

import { getBackendUrl } from '../utils/backendUrl';
import { buildRequestOptions } from '../utils/request';

const API_BASE = `${getBackendUrl()}/api`;
const VISITOR_ID_STORAGE = 'nbnb_visitor_id';

let cachedUser: User | null = null;

export interface User {
  id: string;
  email: string;
  nickname: string | null;
  credit_balance: number;
  is_admin: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface CreditBalance {
  balance: number;
}

/**
 * 获取存储的用户信息
 */
export const getStoredUser = (): User | null => {
  return cachedUser;
};

/**
 * 保存用户信息
 */
export const saveUser = (user: User): void => {
  cachedUser = user;
};

/**
 * 清除认证信息
 */
export const clearAuth = (): void => {
  cachedUser = null;
};

/**
 * 检查是否已登录
 */
export const isAuthenticated = (): boolean => {
  return !!getStoredUser();
};

/**
 * 通用请求函数
 */
const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...buildRequestOptions(options),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '请求失败' }));
    const err = new Error(error.detail || `HTTP error ${response.status}`);
    (err as { status?: number }).status = response.status;
    throw err;
  }

  return response.json();
};

/**
 * 发送验证码
 */
export const sendCode = async (
  email: string,
  purpose: 'register' | 'reset',
  captchaTicket?: string
): Promise<{ message: string }> => {
  return request('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ email, purpose, ...(captchaTicket && { captcha_ticket: captchaTicket }) }),
  });
};

/**
 * 用户注册（需验证码）
 */
export const register = async (
  email: string,
  password: string,
  nickname: string | undefined,
  code: string,
  captchaTicket?: string
): Promise<AuthResponse> => {
  // 获取游客 ID，用于转移游客对话
  const visitorId = localStorage.getItem(VISITOR_ID_STORAGE);

  const data = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      nickname,
      code,
      ...(captchaTicket && { captcha_ticket: captchaTicket }),
      ...(visitorId && { visitor_id: visitorId }),
    }),
  });

  saveUser(data.user);

  return data;
};

/**
 * 用户登录
 */
export const login = async (
  email: string,
  password: string,
  captchaTicket?: string
): Promise<AuthResponse> => {
  // 获取游客 ID，用于转移游客对话
  const visitorId = localStorage.getItem(VISITOR_ID_STORAGE);

  const data = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      ...(captchaTicket && { captcha_ticket: captchaTicket }),
      ...(visitorId && { visitor_id: visitorId }),
    }),
  });

  saveUser(data.user);

  return data;
};

/**
 * 获取当前用户信息
 */
export const getCurrentUser = async (): Promise<User> => {
  const user = await request<User>('/auth/me');
  saveUser(user);
  return user;
};

/**
 * 获取次数余额
 */
export const getCreditBalance = async (): Promise<CreditBalance> => {
  return request<CreditBalance>('/credits/balance');
};

/**
 * 兑换码兑换
 */
export const redeemCode = async (code: string): Promise<{
  success: boolean;
  message: string;
  credits_added: number;
  pro3_credits_added?: number;
  flash_credits_added?: number;
  new_balance: number;
  general_balance?: number;
  pro3_balance?: number;
  flash_balance?: number;
  total_balance?: number;
}> => {
  return request('/redeem/use', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
};


/**
 * 重置密码（通过验证码）
 */
export const resetPassword = async (
  email: string,
  code: string,
  newPassword: string,
  captchaTicket?: string
): Promise<{ message: string }> => {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, new_password: newPassword, ...(captchaTicket && { captcha_ticket: captchaTicket }) }),
  });
};


/**
 * 修改密码（需登录）
 */
export const changePassword = async (
  oldPassword: string,
  newPassword: string
): Promise<{ message: string }> => {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
};

/**
 * 登出
 */
export const logout = async (): Promise<void> => {
  try {
    await request<{ message: string }>('/auth/logout', { method: 'POST' });
  } finally {
    clearAuth();
  }
};
