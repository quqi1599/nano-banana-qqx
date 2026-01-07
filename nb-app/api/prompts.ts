export const config = {
  runtime: 'edge',
};

const PROMPT_API_URL = 'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json';
const FETCH_TIMEOUT_MS = 8000;

export default async function handler(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        'Allow': 'GET, HEAD',
        'Cache-Control': 'no-store',
      },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(PROMPT_API_URL, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`GitHub API responded with ${response.status}`);
    }

    const data = await response.json();

    return new Response(request.method === 'HEAD' ? null : JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // 边缘缓存 1 小时 (3600s), 后台重新验证 24 小时 (86400s)
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Failed to fetch prompts:', error);
    const status = error instanceof DOMException && error.name === 'AbortError' ? 504 : 502;
    return new Response(JSON.stringify({ error: 'Failed to fetch prompts' }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
