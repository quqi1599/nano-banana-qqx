/**
 * 模型计费服务 - 获取模型定价信息
 */

import { getBackendUrl } from '../utils/backendUrl';
import { buildRequestOptions } from '../utils/request';

const API_BASE = `${getBackendUrl()}/api/v1`;

/**
 * 模型计费信息
 */
export interface ModelPricingInfo {
  id: string;
  model_name: string;
  credits_per_request: number;
  created_at: string;
}

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
 * 获取模型计费配置（需要登录）
 */
export const getModelPricing = async (): Promise<ModelPricingInfo[]> => {
  return request<ModelPricingInfo[]>('/user/model-pricing');
};

/**
 * 获取指定模型的积分价格
 */
export const getModelPrice = (modelName: string, pricingList: ModelPricingInfo[]): number | null => {
  const pricing = pricingList.find(p => p.model_name === modelName);
  return pricing?.credits_per_request ?? null;
};
