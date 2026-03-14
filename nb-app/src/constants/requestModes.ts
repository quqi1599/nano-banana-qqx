import type { RequestMode } from '../types';

export const DEFAULT_REQUEST_MODE: RequestMode = 'google_native';

export const REQUEST_MODE_OPTIONS: Array<{
  value: RequestMode;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: 'google_native',
    label: '谷歌原生',
    shortLabel: '原生',
    description: '走 Gemini 原生的 contents / parts 请求格式。',
  },
  {
    value: 'openai_compatible',
    label: 'OpenAI 兼容',
    shortLabel: 'OpenAI',
    description: '走 OpenAI 兼容的 messages 请求格式。',
  },
];

export const normalizeRequestMode = (value?: string | null): RequestMode => {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_');
  if (
    normalized === 'openai' ||
    normalized === 'openai_compatible' ||
    normalized === 'openai_compat'
  ) {
    return 'openai_compatible';
  }
  return DEFAULT_REQUEST_MODE;
};

export const getRequestModeLabel = (mode: RequestMode): string => {
  return REQUEST_MODE_OPTIONS.find((item) => item.value === mode)?.label || '谷歌原生';
};
