/**
 * 获取后端 API 基础 URL
 * 开发环境使用同源路径走 Vite 代理，生产环境使用当前域名
 */
export const getBackendUrl = (): string => {
    // 始终返回空字符串，强制使用相对路径
    // 让 Nginx (生产环境) 或 Vite Proxy (开发环境) 处理转发
    return '';
};
