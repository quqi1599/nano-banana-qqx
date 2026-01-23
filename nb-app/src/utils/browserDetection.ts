/**
 * 浏览器检测工具
 * 特别针对微信内置浏览器、QQ浏览器等国产移动端浏览器的兼容性检测
 */

export interface BrowserInfo {
  isWechat: boolean;
  isQQ: boolean;
  isWeibo: boolean;
  isDingTalk: boolean;
  isAlipay: boolean;
  isUC: boolean;
  isBaidu: boolean;
  isSogou: boolean;
  isMiuiBrowser: boolean;
  isHuawei: boolean;
  isChineseMobileBrowser: boolean; // 任何国产移动端浏览器
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isTouchDevice: boolean;
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  deviceType: 'phone' | 'tablet' | 'desktop' | 'unknown';
  supportsBackdropFilter: boolean;
  supportsWebP: boolean;
  supportsGrid: boolean;
  supportsFlexGap: boolean;
  supportsSticky: boolean;
  x5KernelAvailable: boolean;
}

// 从 window 获取预存的检测结果（由 index.html 脚本设置）
const getCachedDetection = (): Partial<BrowserInfo> | null => {
  if (typeof window === 'undefined') return null;

  return {
    isWechat: (window as any).__isWechatBrowser__ || false,
    isQQ: (window as any).__isQQBrowser__ || false,
    isWeibo: (window as any).__isWeiboBrowser__ || false,
    isChineseMobileBrowser: (window as any).__isChineseMobileBrowser__ || false,
  };
};

const getUserAgent = (): string => {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return '';
  return navigator.userAgent;
};

const detectWechat = (ua: string): boolean => {
  return /micromessenger/i.test(ua);
};

const detectQQ = (ua: string): boolean => {
  // QQ 移动浏览器
  return /qq/i.test(ua) && /mqqbrowser/i.test(ua);
};

const detectWeibo = (ua: string): boolean => {
  return /weibo/i.test(ua);
};

const detectDingTalk = (ua: string): boolean => {
  return /dingtalk/i.test(ua);
};

const detectAlipay = (ua: string): boolean => {
  return /alipay/i.test(ua);
};

const detectUC = (ua: string): boolean => {
  return /ucbrowser/i.test(ua);
};

const detectBaidu = (ua: string): boolean => {
  return /baiduboxapp|baidubrowser/i.test(ua);
};

const detectSogou = (ua: string): boolean => {
  return /sogoumobile/i.test(ua);
};

const detectMiuiBrowser = (ua: string): boolean => {
  return /miuibrowser/i.test(ua);
};

const detectHuawei = (ua: string): boolean => {
  return /huaweibrowser/i.test(ua);
};

const detectIOS = (ua: string): boolean => {
  return /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
};

const detectAndroid = (ua: string): boolean => {
  return /android/i.test(ua);
};

const detectMobile = (ua: string): boolean => {
  return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua) ||
    ((navigator as any).maxTouchPoints > 0 && /mobile|tablet/i.test(ua));
};

const detectTouchDevice = (): boolean => {
  return 'ontouchstart' in window ||
    (navigator as any).maxTouchPoints > 0;
};

const detectDeviceType = (ua: string): 'phone' | 'tablet' | 'desktop' | 'unknown' => {
  // iPad 检测
  if (/ipad/i.test(ua)) {
    return 'tablet';
  }

  // iPadOS 13+ 检测（请求桌面网站的 iPad）
  if (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 0) {
    return 'tablet';
  }

  // Android 平板检测（通常屏幕宽度 >= 768px）
  if (/android/i.test(ua)) {
    const screenWidth = window.innerWidth;
    if (screenWidth >= 768) {
      return 'tablet';
    }
  }

  // 手机检测
  if (/iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return 'phone';
  }

  // 移动设备
  if ((navigator as any).maxTouchPoints > 0 && /mobile/i.test(ua)) {
    return 'phone';
  }

  // 小屏幕设备作为手机
  if (window.innerWidth < 768) {
    return 'phone';
  }

  // 大屏幕设备作为桌面
  if (window.innerWidth >= 1024) {
    return 'desktop';
  }

  return 'unknown';
};

const detectBrowserName = (ua: string): string => {
  if (detectWechat(ua)) return 'WeChat';
  if (detectQQ(ua)) return 'QQ';
  if (detectWeibo(ua)) return 'Weibo';
  if (detectDingTalk(ua)) return 'DingTalk';
  if (detectAlipay(ua)) return 'Alipay';
  if (detectUC(ua)) return 'UC';
  if (detectBaidu(ua)) return 'Baidu';
  if (detectMiuiBrowser(ua)) return 'MiuiBrowser';
  if (detectHuawei(ua)) return 'Huawei';
  if (detectSogou(ua)) return 'Sogou';
  if (/edg/i.test(ua)) return 'Edge';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/opr\//i.test(ua)) return 'Opera';
  return 'Unknown';
};

const detectBrowserVersion = (ua: string): string => {
  const match = ua.match(/(wechat|qq|micromessenger|mqqbrowser|firefox|chrome|safari|edg|opr|version)\/([\d.]+)/i);
  if (match && match[2]) {
    return match[2];
  }

  const versionMatch = ua.match(/android\s([\d.]+)/i);
  if (versionMatch && versionMatch[1]) {
    return versionMatch[1];
  }

  const iosMatch = ua.match(/os\s([\d_]+)\slike\s mac os x/i);
  if (iosMatch && iosMatch[1]) {
    return iosMatch[1].replace(/_/g, '.');
  }

  return 'unknown';
};

const detectOSName = (ua: string): string => {
  if (/iphone|ipod|ipad/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os x/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  if (/cros/i.test(ua)) return 'ChromeOS';
  return 'Unknown';
};

const detectOSVersion = (ua: string): string => {
  // iOS 版本
  const iosMatch = ua.match(/os\s([\d_]+)\slike\s mac os x/i);
  if (iosMatch && iosMatch[1]) {
    return iosMatch[1].replace(/_/g, '.');
  }

  // Android 版本
  const androidMatch = ua.match(/android\s([\d.]+)/i);
  if (androidMatch && androidMatch[1]) {
    return androidMatch[1];
  }

  // Windows 版本
  const windowsMatch = ua.match(/windows\snt\s([\d.]+)/i);
  if (windowsMatch && windowsMatch[1]) {
    return windowsMatch[1];
  }

  return 'unknown';
};

const detectFeatures = (): {
  supportsBackdropFilter: boolean;
  supportsWebP: boolean;
  supportsGrid: boolean;
  supportsFlexGap: boolean;
  supportsSticky: boolean;
  x5KernelAvailable: boolean;
} => {
  const testEl = document.createElement('div');

  // backdrop-filter 支持
  const supportsBackdropFilter = 'backdropFilter' in testEl.style ||
    '-webkit-backdrop-filter' in testEl.style;

  // WebP 支持
  const supportsWebP = document.createElement('canvas')
    .toDataURL('image/webp')
    .indexOf('data:image/webp') === 0;

  // Grid 支持
  const supportsGrid = 'grid' in testEl.style ||
    '-ms-grid' in testEl.style;

  // flex gap 支持
  const supportsFlexGap = CSS.supports('gap', '1px');

  // sticky 支持
  const supportsSticky = 'sticky' in testEl.style ||
    '-webkit-sticky' in testEl.style;

  // X5 内核（微信 Android 版本使用）
  const x5KernelAvailable = 'getBoundingClientRect' in testEl;

  return {
    supportsBackdropFilter,
    supportsWebP,
    supportsGrid,
    supportsFlexGap,
    supportsSticky,
    x5KernelAvailable,
  };
};

let cachedBrowserInfo: BrowserInfo | null = null;

/**
 * 获取浏览器信息（带缓存）
 */
export const getBrowserInfo = (): BrowserInfo => {
  if (cachedBrowserInfo) {
    return cachedBrowserInfo;
  }

  const ua = getUserAgent();
  const cached = getCachedDetection();
  const features = detectFeatures();

  const browserInfo: BrowserInfo = {
    isWechat: cached?.isWechat || detectWechat(ua),
    isQQ: cached?.isQQ || detectQQ(ua),
    isWeibo: cached?.isWeibo || detectWeibo(ua),
    isDingTalk: detectDingTalk(ua),
    isAlipay: detectAlipay(ua),
    isUC: detectUC(ua),
    isBaidu: detectBaidu(ua),
    isSogou: detectSogou(ua),
    isMiuiBrowser: detectMiuiBrowser(ua),
    isHuawei: detectHuawei(ua),
    isChineseMobileBrowser: cached?.isChineseMobileBrowser ||
      detectWechat(ua) || detectQQ(ua) || detectWeibo(ua) ||
      detectDingTalk(ua) || detectAlipay(ua) || detectUC(ua) ||
      detectMiuiBrowser(ua) || detectHuawei(ua),
    isIOS: detectIOS(ua),
    isAndroid: detectAndroid(ua),
    isMobile: detectMobile(ua),
    isTouchDevice: detectTouchDevice(),
    browserName: detectBrowserName(ua),
    browserVersion: detectBrowserVersion(ua),
    osName: detectOSName(ua),
    osVersion: detectOSVersion(ua),
    deviceType: detectDeviceType(ua),
    supportsBackdropFilter: features.supportsBackdropFilter,
    supportsWebP: features.supportsWebP,
    supportsGrid: features.supportsGrid,
    supportsFlexGap: features.supportsFlexGap,
    supportsSticky: features.supportsSticky,
    x5KernelAvailable: features.x5KernelAvailable,
  };

  cachedBrowserInfo = browserInfo;
  return browserInfo;
};

/**
 * 检查是否在微信浏览器中
 */
export const isWechatBrowser = (): boolean => {
  return getBrowserInfo().isWechat;
};

/**
 * 检查是否在国产移动端浏览器中（微信、QQ、微博等）
 */
export const isChineseMobileBrowser = (): boolean => {
  return getBrowserInfo().isChineseMobileBrowser;
};

/**
 * 检查是否需要应用特定的兼容性修复
 */
export const needsCompatibilityFixes = (): {
  needsFlexGapFallback: boolean;
  needsBackdropFilterFallback: boolean;
  needsGridFallback: boolean;
  needsStickyFallback: boolean;
} => {
  const info = getBrowserInfo();
  return {
    needsFlexGapFallback: !info.supportsFlexGap,
    needsBackdropFilterFallback: !info.supportsBackdropFilter,
    needsGridFallback: !info.supportsGrid,
    needsStickyFallback: !info.supportsSticky,
  };
};

/**
 * 获取浏览器特定的 CSS 类名
 */
export const getBrowserClassNames = (): string[] => {
  const info = getBrowserInfo();
  const classes: string[] = [];

  if (info.isWechat) classes.push('wechat-browser');
  if (info.isQQ) classes.push('qq-browser');
  if (info.isWeibo) classes.push('weibo-browser');
  if (info.isDingTalk) classes.push('dingtalk-browser');
  if (info.isAlipay) classes.push('alipay-browser');
  if (info.isChineseMobileBrowser) classes.push('chinese-mobile-browser');
  if (info.isIOS) classes.push('ios');
  if (info.isAndroid) classes.push('android');
  if (info.isMobile) classes.push('mobile');
  if (info.isTouchDevice) classes.push('touch');
  if (!info.supportsFlexGap) classes.push('no-flex-gap');
  if (!info.supportsBackdropFilter) classes.push('no-backdrop-filter');
  if (!info.supportsGrid) classes.push('no-grid');
  if (!info.supportsSticky) classes.push('no-sticky');

  return classes;
};

/**
 * 将浏览器类名应用到根元素
 */
export const applyBrowserClasses = (): void => {
  if (typeof document === 'undefined') return;

  const classes = getBrowserClassNames();
  const root = document.documentElement;

  classes.forEach(cls => root.classList.add(cls));
};

/**
 * 微信浏览器专用：检查是否为 X5 内核
 */
export const isX5Kernel = (): boolean => {
  const ua = getUserAgent();
  // X5 内核特征
  return /qqbrowser|micromessenger|qqlive_bro/i.test(ua) &&
    /wx57361d19ad14b98|wx57361d19ad14b98|-webkit/i.test(ua);
};

/**
 * 获取浏览器显示名称（用于调试）
 */
export const getBrowserDisplayName = (): string => {
  const info = getBrowserInfo();
  return `${info.browserName} ${info.browserVersion} on ${info.osName} ${info.osVersion}`;
};

export default {
  getBrowserInfo,
  isWechatBrowser,
  isChineseMobileBrowser,
  needsCompatibilityFixes,
  getBrowserClassNames,
  applyBrowserClasses,
  isX5Kernel,
  getBrowserDisplayName,
};
