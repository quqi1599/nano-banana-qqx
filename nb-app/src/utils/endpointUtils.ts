import { ALLOWED_ENDPOINT_HOSTS, DEFAULT_API_ENDPOINT } from '../config/api';

const parseEnvHosts = (): string[] => {
  const raw = import.meta.env?.VITE_ALLOWED_ENDPOINT_HOSTS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
};

export const getAllowedEndpointHosts = (): string[] => {
  const hosts = [...ALLOWED_ENDPOINT_HOSTS, ...parseEnvHosts()];
  return Array.from(new Set(hosts));
};

export const normalizeEndpoint = (raw: string): string => {
  const url = new URL(raw.trim());
  const trimmedPath = url.pathname.replace(/\/+$/, '');
  const normalizedPath = trimmedPath && trimmedPath !== '/' ? trimmedPath : '';
  return `${url.origin}${normalizedPath}`;
};

export const validateEndpoint = (raw: string): { ok: boolean; reason?: string; normalized?: string } => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: '接口地址不能为空。' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: '接口地址格式不正确。' };
  }

  if (url.username || url.password) {
    return { ok: false, reason: '接口地址不允许包含用户名或密码。' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: '仅允许 https 接口地址。' };
  }

  // 不再强制域名白名单，允许用户自定义任意 https 域名

  if (url.search || url.hash) {
    return { ok: false, reason: '接口地址不允许包含查询参数或片段。' };
  }

  return { ok: true, normalized: normalizeEndpoint(trimmed) };
};

export const getApiBaseUrl = (customEndpoint?: string): string => {
  if (!customEndpoint || !customEndpoint.trim()) {
    return DEFAULT_API_ENDPOINT;
  }

  const result = validateEndpoint(customEndpoint);
  if (!result.ok) {
    return DEFAULT_API_ENDPOINT;
  }
  return result.normalized || DEFAULT_API_ENDPOINT;
};

const getProxyBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return '/gemini-api';
  }
  return new URL('/gemini-api', window.location.origin).toString();
};

export const resolveApiBaseUrl = (_customEndpoint?: string): string => {
  // 始终使用默认接口地址，避免用户配置错误
  if (import.meta.env.DEV) {
    return getProxyBaseUrl();
  }
  return DEFAULT_API_ENDPOINT;
};
