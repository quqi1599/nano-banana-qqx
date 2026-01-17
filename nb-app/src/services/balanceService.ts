import { AppSettings } from '../types';
import { resolveApiBaseUrl, getApiBaseUrl } from '../utils/endpointUtils';
import { DEFAULT_API_ENDPOINT } from '../config/api';

// New API 的计费单位：1美元 = 500000分
const NEW_API_CREDIT_TO_USD_RATE = 1 / 500000;

export interface BalanceInfo {
  hardLimitUsd: number;
  usage: number;
  remaining: number;
  isUnlimited: boolean;
}

/**
 * New API 平台返回的数据结构
 * 文档: https://doc.newapi.pro/api/token-usage/
 */
interface NewApiTokenUsageResponse {
  code: boolean;
  message?: string;
  data?: {
    object: string;
    name: string;
    total_granted: number;      // 授予总量（单位：分）
    total_used: number;         // 已使用额度（单位：分）
    total_available: number;    // 可用剩余额度（单位：分）
    unlimited_quota: boolean;   // 是否无限额度
    model_limits?: Record<string, boolean>;
    model_limits_enabled: boolean;
    expires_at: number;         // 到期时间，0 表示永不过期
  };
}

/**
 * 尝试使用 OpenAI 兼容的 Dashboard API 查询余额
 */
const fetchBalanceOpenAI = async (
  baseUrl: string,
  headers: Record<string, string>
): Promise<BalanceInfo> => {
  // 1. 查询订阅信息(总额度)
  const subscriptionRes = await fetch(`${baseUrl}/v1/dashboard/billing/subscription`, {
    headers,
  });

  if (!subscriptionRes.ok) {
    throw new Error(`订阅查询失败: ${subscriptionRes.status} ${subscriptionRes.statusText}`);
  }

  const subscriptionData = await subscriptionRes.json();
  const hardLimitUsd = subscriptionData.hard_limit_usd || 0;

  // 2. 查询使用情况(近99天 + 1天)
  const now = new Date();
  const startDate = new Date(now.getTime() - 99 * 24 * 3600 * 1000);
  const endDate = new Date(now.getTime() + 1 * 24 * 3600 * 1000);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const startDateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
  const endDateStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;

  const usageRes = await fetch(
    `${baseUrl}/v1/dashboard/billing/usage?start_date=${startDateStr}&end_date=${endDateStr}`,
    { headers }
  );

  if (!usageRes.ok) {
    throw new Error(`使用量查询失败: ${usageRes.status} ${usageRes.statusText}`);
  }

  const usageData = await usageRes.json();
  const totalUsage = (usageData.total_usage || 0) / 100; // 转换为美元

  // 3. 计算剩余额度
  const isUnlimited = hardLimitUsd >= 100000000;
  const remaining = isUnlimited ? Infinity : hardLimitUsd - totalUsage;

  return {
    hardLimitUsd: isUnlimited ? Infinity : hardLimitUsd,
    usage: isUnlimited ? 0 : totalUsage,
    remaining,
    isUnlimited,
  };
};

/**
 * 使用 New API 平台的 /api/usage/token 接口查询余额
 * 文档: https://doc.newapi.pro/api/token-usage/
 */
const fetchBalanceNewApi = async (
  baseUrl: string,
  headers: Record<string, string>
): Promise<BalanceInfo> => {
  const res = await fetch(`${baseUrl}/api/usage/token`, {
    headers,
  });

  if (!res.ok) {
    throw new Error(`New API 查询失败: ${res.status} ${res.statusText}`);
  }

  const data: NewApiTokenUsageResponse = await res.json();

  // New API 使用 code 字段而不是 success 字段
  if (!data.code || !data.data) {
    throw new Error(data.message || 'New API 返回数据格式错误');
  }

  // New API 的额度单位是"分"，需要转换为美元
  // 参考: 1美元 = 500000分（New API 的计费单位）
  const grantedInUsd = data.data.total_granted * NEW_API_CREDIT_TO_USD_RATE;
  const usedInUsd = data.data.total_used * NEW_API_CREDIT_TO_USD_RATE;

  // 使用 API 返回的 unlimited_quota 字段判断是否无限
  const isUnlimited = data.data.unlimited_quota;

  return {
    hardLimitUsd: isUnlimited ? Infinity : grantedInUsd,
    usage: isUnlimited ? 0 : usedInUsd,
    remaining: isUnlimited ? Infinity : data.data.total_available * NEW_API_CREDIT_TO_USD_RATE,
    isUnlimited,
  };
};

/**
 * 查询 API Key 的余额信息
 * 自动检测 API 类型：先尝试 OpenAI 兼容方式，失败后切换到 New API 方式
 */
export const fetchBalance = async (
  apiKey: string,
  settings: AppSettings
): Promise<BalanceInfo> => {
  // 获取实际的目标端点（用户自定义或默认）
  const targetEndpoint = getApiBaseUrl(settings.customEndpoint);
  // 获取请求基础 URL（开发环境使用代理，生产环境直接使用目标端点）
  const baseUrl = resolveApiBaseUrl(settings.customEndpoint);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  // 开发环境：设置代理目标端点头，让 Vite 代理知道转发到哪里
  if (import.meta.env.DEV) {
    headers['x-target-endpoint'] = targetEndpoint;
  }

  // 1. 先尝试 OpenAI 兼容的 Dashboard API
  try {
    console.log(`尝试使用 OpenAI Dashboard API 查询余额... (目标: ${targetEndpoint})`);
    const result = await fetchBalanceOpenAI(baseUrl, headers);
    console.log('OpenAI Dashboard API 查询成功');
    return result;
  } catch (openaiError) {
    console.warn('OpenAI Dashboard API 查询失败，尝试 New API...', openaiError);
  }

  // 2. 降级到 New API 的 /api/usage/token 接口
  try {
    console.log('尝试使用 New API 查询余额...');
    const result = await fetchBalanceNewApi(baseUrl, headers);
    console.log('New API 查询成功');
    return result;
  } catch (newApiError) {
    console.error('New API 查询也失败:', newApiError);
    throw new Error('余额查询失败：OpenAI Dashboard API 和 New API 均不可用');
  }
};

/**
 * 格式化金额显示
 */
export const formatBalance = (amount: number, isUnlimited: boolean): string => {
  if (isUnlimited || amount === Infinity) {
    return '无限';
  }

  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)}K`;
  }

  return amount.toFixed(2);
};

/**
 * 格式化消耗金额显示
 */
export const formatCost = (cost: number): string => {
  if (cost <= 0) {
    return '$0.00';
  }
  if (cost < 0.01) {
    return '< $0.01';
  }
  if (cost < 1) {
    return `$${cost.toFixed(2)}`;
  }
  return `$${cost.toFixed(2)}`;
};
