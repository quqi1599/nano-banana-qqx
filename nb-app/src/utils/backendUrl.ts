/**
 * 获取后端 API 基础 URL
 * 开发环境使用 localhost:8000，生产环境使用当前域名
 */
export const getBackendUrl = (): string => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // 开发环境：前端 3000，后端 8000
    if (isDev) {
        return 'http://localhost:8000';
    }

    // 生产环境：使用同域（nginx 会代理 /api/ 到 backend:8000）
    return window.location.origin;
};
