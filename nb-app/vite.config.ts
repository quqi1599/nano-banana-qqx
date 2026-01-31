import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { DEFAULT_API_ENDPOINT } from './src/config/api';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    // 移动端优化配置
    css: {
      devSourcemap: false,
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // 移动端开发时禁用 HTTPS 检查
      https: false,
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
        selfDestroying: false,
        registerType: 'autoUpdate',
        // 禁用预缓存，避免 404 错误
        strategies: 'generateSW',
        // 不预缓存任何文件，只运行时缓存
        workbox: {
          globIgnores: ['**/DinoGame*', '**/SnakeGame*', '**/LifeGame*', '**/Puzzle2048*'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'jsdelivr-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
                }
              }
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
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
      },
      // 强制提取 CSS 到独立文件
      cssCodeSplit: false,
      cssMinify: true,
    }
  };
});
