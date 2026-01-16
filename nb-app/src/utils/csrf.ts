const CSRF_COOKIE_NAME = 'nbnb_csrf';

export const getCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(';');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
};

export const getCsrfToken = (): string | null => getCookieValue(CSRF_COOKIE_NAME);
