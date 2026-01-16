import { getCsrfToken } from './csrf';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const buildJsonHeaders = (options: RequestInit = {}): Headers => {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const method = (options.method || 'GET').toUpperCase();
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  return headers;
};

export const buildRequestOptions = (options: RequestInit = {}): RequestInit => {
  return {
    ...options,
    credentials: 'include',
    headers: buildJsonHeaders(options),
  };
};
