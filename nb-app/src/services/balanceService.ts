import { AppSettings } from '../types';
import { getApiBaseUrl } from '../utils/endpointUtils';

export interface BalanceInfo {
  hardLimitUsd: number;
  usage: number;
  remaining: number;
  isUnlimited: boolean;
}

/**
 * 查询 API Key 的余额信息
 * 适用于 OpenAI 兼容的 API endpoint
 */
export const fetchBalance = async (
  apiKey: string,
  settings: AppSettings
): Promise<BalanceInfo> => {
  // 始终使用代理路径绕过 CORS（开发环境 Vite 代理，生产环境 nginx 代理）
  const baseUrl = '/gemini-api';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  try {
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
  } catch (error) {
    console.error('余额查询失败:', error);
    throw error;
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
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }

  return amount.toFixed(1);
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
