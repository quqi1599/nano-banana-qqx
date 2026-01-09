/**
 * 认证服务 - 处理用户注册、登录、Token 管理
 */

// 后端 API 地址
const getBackendUrl = (): string => {
  // 开发环境使用本地后端，生产环境使用同域名
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isDev && window.location.port === '3000') {
    return 'http://localhost:8000';
  }
  return window.location.origin;
};

const API_BASE = `${getBackendUrl()}/api`;

// 存储 key
const TOKEN_KEY = 'nbnb_auth_token';
const USER_KEY = 'nbnb_user';

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
 * 获取存储的 Token
 */
export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * 保存 Token
 */
export const saveToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

/**
 * 获取存储的用户信息
 */
export const getStoredUser = (): User | null => {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

/**
 * 保存用户信息
 */
export const saveUser = (user: User): void => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

/**
 * 清除认证信息
 */
export const clearAuth = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

/**
 * 检查是否已登录
 */
export const isAuthenticated = (): boolean => {
  return !!getToken();
};

/**
 * 通用请求函数
 */
const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '请求失败' }));
    throw new Error(error.detail || `HTTP error ${response.status}`);
  }

  return response.json();
};

/**
 * 用户注册
 */
export const register = async (
  email: string,
  password: string,
  nickname?: string
): Promise<AuthResponse> => {
  const data = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
  });

  saveToken(data.access_token);
  saveUser(data.user);

  return data;
};

/**
 * 用户登录
 */
export const login = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const data = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  saveToken(data.access_token);
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
 * 获取积分余额
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
  new_balance: number;
}> => {
  return request('/redeem/use', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
};

/**
 * 登出
 */
export const logout = (): void => {
  clearAuth();
};
