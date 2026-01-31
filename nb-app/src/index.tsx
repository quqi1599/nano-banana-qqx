import { render } from 'preact';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

render(<App />, rootElement);

// Remove splash screen with a fade-out effect
const splashScreen = document.getElementById('app-loading');
if (splashScreen) {
  // 确保加载屏幕被移除的兜底逻辑
  const removeSplashScreen = () => {
    if (!splashScreen || !splashScreen.parentNode) return;
    splashScreen.style.opacity = '0';
    setTimeout(() => {
      if (splashScreen && splashScreen.parentNode) {
        splashScreen.remove();
      }
    }, 300);
  };

  // 方法1: 等待 DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeSplashScreen, { once: true });
  } else {
    // DOM 已经加载完成
    removeSplashScreen();
  }

  // 方法2: 使用 requestAnimationFrame (现代浏览器)
  requestAnimationFrame(() => {
    requestAnimationFrame(removeSplashScreen);
  });

  // 方法3: 兜底定时器 - 确保即使上面方法都失败也能移除
  setTimeout(removeSplashScreen, 2000);

  // 方法4: window load 事件作为最终兜底
  window.addEventListener('load', removeSplashScreen, { once: true });
}
