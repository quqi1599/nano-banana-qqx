import { render } from 'preact';
import './index.css';
import { AdminApp } from './AdminApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

render(<AdminApp />, rootElement);

const splashScreen = document.getElementById('app-loading');
if (splashScreen) {
  requestAnimationFrame(() => {
    splashScreen.style.opacity = '0';
    setTimeout(() => {
      splashScreen.remove();
    }, 300);
  });
}
