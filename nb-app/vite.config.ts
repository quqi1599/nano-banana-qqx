import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { DEFAULT_API_ENDPOINT } from './src/config/api';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/prompts': {
          target: 'https://cdn.jsdelivr.net',
          changeOrigin: true,
          rewrite: (path) => '/gh/glidea/banana-prompt-quicker@main/prompts.json',
          secure: true,
        },
        // 后端 API 代理 (开发模式用)
        '/api': {
          target: process.env.VITE_API_TARGET || 'http://backend:8000',
          changeOrigin: true,
        },
        // 动态代理所有 API 请求（开发环境绕过 CORS）
        '/gemini-api': {
          target: DEFAULT_API_ENDPOINT,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/gemini-api/, ''),
          secure: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // 从请求头中获取目标端点
              const targetEndpoint = req.headers['x-target-endpoint'] as string;
              if (targetEndpoint) {
                try {
                  const url = new URL(targetEndpoint);
                  // @ts-ignore - 动态修改目标
                  options.target = url.origin;
                } catch (e) {
                  // URL 解析失败时使用默认端点，不中断请求
                  console.warn('[Proxy] Invalid target endpoint, using default:', targetEndpoint, e);
                }
              }
            });
          },
        },
      },
    },
    plugins: [
      preact(),
      tailwindcss(),
      VitePWA({
        selfDestroying: false, // 保留旧 SW 直到新版本激活，避免更新失败时丢失离线功能
        registerType: 'autoUpdate',
        manifest: {
          name: 'nbnb',
          short_name: 'nbnb',
          description: 'DEAI - AI 图像生成平台',
          theme_color: '#ffffff',
          icons: []
        }
      }),
    ],
    define: {
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'react': 'preact/compat',
        'react-dom/test-utils': 'preact/test-utils',
        'react-dom': 'preact/compat',     // Must be below test-utils
        'react/jsx-runtime': 'preact/jsx-runtime'
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin/index.html'),
        },
        output: {
          manualChunks: {
            'preact-vendor': [
              'preact',
              'preact/compat',
              'preact/hooks',
              'preact/jsx-runtime',
            ],
            'google-genai': ['@google/genai'],
            'markdown-libs': ['react-markdown', 'remark-gfm']
          }
        }
      }
    }
  };
});
