import { render } from 'preact';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// 添加加载诊断
window.__appLoadDiagnostics = {
  startTime: Date.now(),
  steps: []
};

const logStep = (step) => {
  window.__appLoadDiagnostics.steps.push({ step, time: Date.now() });
  console.log('[App Load]', step);
};

logStep('index.tsx loaded');

render(<App />, rootElement);

logStep('App rendered');

// 移除加载屏幕的函数
const removeSplashScreen = () => {
  logStep('removeSplashScreen called');
  const splashScreen = document.getElementById('app-loading');
  if (!splashScreen) {
    logStep('splash screen not found');
    return;
  }

  // 标记为正在移除，防止重复移除
  if (splashScreen.dataset.removing === 'true') {
    logStep('splash screen already removing');
    return;
  }
  splashScreen.dataset.removing = 'true';
  logStep('splash screen marked for removal');

  splashScreen.style.opacity = '0';
  setTimeout(() => {
    if (splashScreen && splashScreen.parentNode) {
      splashScreen.remove();
      logStep('splash screen removed');
    }
  }, 300);
};

// 将移除函数暴露到 window，供 App 组件调用
(window as any).__removeSplashScreen = removeSplashScreen;

// 兜底逻辑：如果 App 没有在 5 秒内调用移除函数，强制移除
setTimeout(() => {
  logStep('fallback timeout triggered');
  console.log('[App Load] Current diagnostics:', window.__appLoadDiagnostics);
  removeSplashScreen();
}, 5000);

// 全局错误捕获
window.addEventListener('error', (e) => {
  logStep('ERROR: ' + e.message);
  console.error('[App Load Error]', e);
  // 发生错误时也移除加载屏幕，避免卡死
  removeSplashScreen();
});

window.addEventListener('unhandledrejection', (e) => {
  logStep('PROMISE ERROR: ' + e.reason);
  console.error('[App Load Promise Error]', e);
  removeSplashScreen();
});
