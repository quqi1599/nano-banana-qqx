import { BANANA_2_MODEL_NAME, normalizeImageModelName } from '../constants/modelProfiles';

const MODEL_PERMISSION_HINTS = [
  '无权访问',
  '权限不足',
  'permission denied',
  'no permission',
  'access denied',
  'insufficient permission',
  'forbidden',
  'not allowed',
];

const MODEL_CONTEXT_HINTS = ['模型', 'model'];

export const BANANA_31_PERMISSION_HINT =
  '当前令牌无 Banana 2（3.1模型）权限，请切换到 Banana Pro (3.0模型) 或 Banana（2.5模型）后重试。';

const getStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || '';
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const nestedError = record.error;
  if (typeof nestedError === 'string') return nestedError;
  if (nestedError && typeof nestedError === 'object') {
    const nestedRecord = nestedError as Record<string, unknown>;
    if (typeof nestedRecord.message === 'string') return nestedRecord.message;
    if (typeof nestedRecord.detail === 'string') return nestedRecord.detail;
  }

  if (typeof record.message === 'string') return record.message;
  if (typeof record.detail === 'string') return record.detail;

  return '';
};

export const extractErrorMessage = (error: unknown): string => getStringValue(error).trim();

export const isModelAccessDeniedMessage = (message: string): boolean => {
  const normalized = message.toLowerCase();
  const hasPermissionHint = MODEL_PERMISSION_HINTS.some((hint) => normalized.includes(hint));
  if (!hasPermissionHint) return false;
  return MODEL_CONTEXT_HINTS.some((hint) => normalized.includes(hint));
};

export const isBanana31AccessDeniedError = (error: unknown, modelName?: string): boolean => {
  const message = extractErrorMessage(error);
  if (!message) return false;
  if (!isModelAccessDeniedMessage(message)) return false;

  const normalizedModelName = normalizeImageModelName(modelName);
  const messageLower = message.toLowerCase();
  return (
    normalizedModelName === BANANA_2_MODEL_NAME ||
    messageLower.includes(BANANA_2_MODEL_NAME) ||
    messageLower.includes('gemini-3.1')
  );
};
