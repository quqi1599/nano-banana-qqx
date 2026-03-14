/**
 * API 接口配置
 */

export type RelayOpenAIImageApiMode = 'legacy_chat_completions' | 'standard_images_api';

export interface RelayApiOption {
  label: string;
  value: string;
  host: string;
  openAIImageApiMode: RelayOpenAIImageApiMode;
}

// 默认中转接口地址（平台中转站点）
export const DEFAULT_API_ENDPOINT = 'https://nanobanana2.peacedejiai.cc/';

export const RELAY_API_OPTIONS: readonly RelayApiOption[] = [
  {
    label: '默认线路',
    value: DEFAULT_API_ENDPOINT,
    host: 'nanobanana2.peacedejiai.cc',
    openAIImageApiMode: 'legacy_chat_completions',
  },
  {
    label: '备用线路',
    value: 'https://528ai.cc/',
    host: '528ai.cc',
    openAIImageApiMode: 'standard_images_api',
  },
] as const;

export const normalizeRelayEndpoint = (endpoint: string): string => endpoint.trim().replace(/\/+$/, '');

const parseRelayOrigin = (endpoint: string): string | null => {
  try {
    return new URL(endpoint.trim()).origin.toLowerCase();
  } catch {
    return null;
  }
};

const getRelayOptionByOrigin = (endpoint?: string | null): RelayApiOption | null => {
  const origin = endpoint ? parseRelayOrigin(endpoint) : null;
  if (!origin) return null;
  return RELAY_API_OPTIONS.find((option) => parseRelayOrigin(option.value) === origin) || null;
};

export const getRelayApiOption = (endpoint?: string | null): RelayApiOption | null => {
  if (!endpoint?.trim()) {
    return RELAY_API_OPTIONS[0] || null;
  }

  const byOrigin = getRelayOptionByOrigin(endpoint);
  if (byOrigin) {
    return byOrigin;
  }

  const normalized = normalizeRelayEndpoint(endpoint);
  return (
    RELAY_API_OPTIONS.find((option) => normalizeRelayEndpoint(option.value) === normalized) || null
  );
};

export const isTrustedRelayEndpoint = (endpoint?: string | null): boolean => {
  return getRelayApiOption(endpoint) !== null;
};

export const getTrustedRelayEndpoint = (endpoint?: string | null): string => {
  return getRelayApiOption(endpoint)?.value || DEFAULT_API_ENDPOINT;
};

export const ALLOWED_ENDPOINT_HOSTS = RELAY_API_OPTIONS.map((option) => option.host);
