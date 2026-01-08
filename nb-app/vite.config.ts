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
                  console.error('Invalid target endpoint:', targetEndpoint);
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
        registerType: 'prompt', // 改成 prompt 模式，让用户决定是否更新
        includeAssets: ['kuai.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        devOptions: {
          enabled: true
        },
        workbox: {
          // 让新 Service Worker 立即激活，不等待旧的关闭
          skipWaiting: true,
          clientsClaim: true,
          // 不缓存 index.html，确保每次都能检测到更新
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        manifest: {
          name: 'nbnb',
          short_name: 'nbnb',
          description: 'DEAI - AI 图像生成平台',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
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
        output: {
          manualChunks: {
            'google-genai': ['@google/genai'],
            'markdown-libs': ['react-markdown', 'remark-gfm']
          }
        }
      }
    }
  };
});
