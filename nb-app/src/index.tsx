import { render } from 'preact';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

render(<App />, rootElement);

// 移除加载屏幕的函数
const removeSplashScreen = () => {
  const splashScreen = document.getElementById('app-loading');
  if (!splashScreen || !splashScreen.parentNode) return;

  // 标记为正在移除，防止重复移除
  if (splashScreen.dataset.removing === 'true') return;
  splashScreen.dataset.removing = 'true';

  splashScreen.style.opacity = '0';
  setTimeout(() => {
    if (splashScreen && splashScreen.parentNode) {
      splashScreen.remove();
    }
  }, 300);
};

// 将移除函数暴露到 window，供 App 组件调用
(window as any).__removeSplashScreen = removeSplashScreen;

// 兜底逻辑：如果 App 没有在 5 秒内调用移除函数，强制移除
setTimeout(() => {
  removeSplashScreen();
}, 5000);
