import React, { useEffect, useState, Suspense } from 'react';
import { useAppStore } from './store/useAppStore';
import { useUiStore } from './store/useUiStore';
import { useAuthStore } from './store/useAuthStore';
import { ChatInterface } from './components/ChatInterface';
import { ConversationHistoryPanel } from './components/ConversationHistoryPanel';
import { ToastContainer } from './components/ui/ToastContainer';
import { GlobalDialog } from './components/ui/GlobalDialog';
import { WeChatQRModal } from './components/WeChatQRModal';
import { WelcomeModal } from './components/WelcomeModal';
import { AuthModal } from './components/AuthModal';
import { TicketModal } from './components/TicketModal';
import { PaymentPage } from './components/PaymentPage';
import { formatBalance } from './services/balanceService';
import { preloadPrompts } from './services/promptService';
import { getUnreadCount, getAdminUnreadCount } from './services/ticketService';
import { Settings, Sun, Moon, ImageIcon, DollarSign, Download, Sparkles, Key, MessageCircle, Plus, User, LogOut, Coins, ShieldCheck, MessageSquare, CreditCard } from 'lucide-react';
import { lazyWithRetry, preloadComponents } from './utils/lazyLoadUtils';
import { validateEndpoint } from './utils/endpointUtils';
import { DEFAULT_API_ENDPOINT } from './config/api';
import { SessionManager } from './components/SessionManager';

// Lazy load components
const ApiKeyModal = lazyWithRetry(() => import('./components/ApiKeyModal').then(module => ({ default: module.ApiKeyModal })));
const SettingsPanel = lazyWithRetry(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })));
const ImageHistoryPanel = lazyWithRetry(() => import('./components/ImageHistoryPanel').then(module => ({ default: module.ImageHistoryPanel })));
const PromptLibraryPanel = lazyWithRetry(() => import('./components/PromptLibraryPanel').then(module => ({ default: module.PromptLibraryPanel })));

const App: React.FC = () => {
  const { apiKey, settings, updateSettings, isSettingsOpen, toggleSettings, imageHistory, balance, fetchBalance, installPrompt, setInstallPrompt, clearHistory, loadConversation, createNewConversation } = useAppStore();
  const { togglePromptLibrary, isPromptLibraryOpen, showApiKeyModal, setShowApiKeyModal, showDialog, addToast } = useUiStore();
  const { isAuthenticated, user, initAuth, logout } = useAuthStore();
  const [hasHydrated, setHasHydrated] = useState(useAppStore.persist.hasHydrated());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showPaymentPage, setShowPaymentPage] = useState(false);
  const [ticketUnreadCount, setTicketUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [skipApiKeyPrompt, setSkipApiKeyPrompt] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('nbnb_skip_api_key') === '1';
  });
  const canUseHistory = isAuthenticated || !!apiKey;
  // 对话历史侧边栏状态
  const [isConversationHistoryOpen, setIsConversationHistoryOpen] = useState(false);
  const [isConversationHistoryCollapsed, setIsConversationHistoryCollapsed] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setInstallPrompt]);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    // Show the install prompt
    installPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // We've used the prompt, and can't use it again, throw it away
    setInstallPrompt(null);
  };

  // Preload components and prompt data after mount
  useEffect(() => {
    preloadComponents([
      () => import('./components/ApiKeyModal'),
      () => import('./components/SettingsPanel'),
      () => import('./components/ImageHistoryPanel'),
      () => import('./components/PromptLibraryPanel'),
      // Also preload components used in ChatInterface
      () => import('./components/ThinkingIndicator'),
      () => import('./components/MessageBubble'),
      // Preload Games
      () => import('./components/games/SnakeGame'),
      () => import('./components/games/DinoGame'),
      () => import('./components/games/LifeGame'),
      () => import('./components/games/Puzzle2048')
    ]);

    // Preload prompt library data in background
    preloadPrompts();
  }, []);

  // 初始化认证状态
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // 轮询工单未读数量
  useEffect(() => {
    if (!isAuthenticated) {
      setTicketUnreadCount(0);
      setAdminUnreadCount(0);
      return;
    }

    const fetchUnreadCounts = async () => {
      try {
        if (user?.is_admin) {
          const adminData = await getAdminUnreadCount();
          setAdminUnreadCount(adminData.unread_count);
        }
        const userData = await getUnreadCount();
        setTicketUnreadCount(userData.unread_count);
      } catch (error) {
        // 静默失败，不显示错误
        console.debug('Failed to fetch unread count:', error);
      }
    };

    // 立即获取一次
    fetchUnreadCounts();

    // 每30秒轮询一次
    const interval = setInterval(fetchUnreadCounts, 30000);

    return () => clearInterval(interval);
  }, [isAuthenticated, user?.is_admin]);

  const [mounted, setMounted] = useState(false);
  const [isImageHistoryOpen, setIsImageHistoryOpen] = useState(false);
  const [showFloatingWeChatQR, setShowFloatingWeChatQR] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // 首次访问检测
  useEffect(() => {
    if (!hasHydrated) return;
    const hasVisited = localStorage.getItem('deai_has_visited');
    if (!hasVisited) {
      setShowWelcome(true);
      localStorage.setItem('deai_has_visited', 'true');
    }
  }, [hasHydrated]);

  useEffect(() => {
    if (useAppStore.persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }
    return useAppStore.persist.onFinishHydration(() => setHasHydrated(true));
  }, []);

  // Auto-show API Key modal if no key is set AND welcome modal is closed
  useEffect(() => {
    if (mounted && hasHydrated && !apiKey && !showWelcome && !isAuthenticated && !skipApiKeyPrompt) {
      setShowApiKeyModal(true);
    }
  }, [mounted, hasHydrated, apiKey, showWelcome, setShowApiKeyModal, isAuthenticated, skipApiKeyPrompt]);

  const handleSkipApiKeyPrompt = () => {
    localStorage.setItem('nbnb_skip_api_key', '1');
    setSkipApiKeyPrompt(true);
    setShowApiKeyModal(false);
  };

  useEffect(() => {
    setMounted(true);
    if (!hasHydrated) return;

    const params = new URLSearchParams(window.location.search);
    const urlEndpoint = params.get('endpoint')?.trim();
    const urlModel = params.get('model');

    if (urlModel) {
      updateSettings({ modelName: urlModel });
    }

    if (urlEndpoint) {
      const result = validateEndpoint(urlEndpoint);

      if (!result.ok) {
        showDialog({
          type: 'alert',
          title: '无效接口地址',
          message: result.reason || '接口地址格式不正确。',
          onConfirm: () => { }
        });
      } else {
        const normalizedEndpoint = result.normalized || urlEndpoint;
        showDialog({
          type: 'confirm',
          title: '应用自定义接口地址？',
          message: `检测到 URL 中的接口地址：${normalizedEndpoint}\n仅在信任该地址时应用。`,
          confirmLabel: '应用',
          cancelLabel: '忽略',
          onConfirm: () => updateSettings({ customEndpoint: normalizedEndpoint })
        });
      }
    }

    if (params.has('apikey')) {
      addToast('已忽略 URL 中的 apikey 参数，请通过弹窗输入 API Key（更安全）', 'info');
      const sanitizedUrl = new URL(window.location.href);
      sanitizedUrl.searchParams.delete('apikey');
      window.history.replaceState({}, '', sanitizedUrl.toString());
    }
  }, [addToast, showDialog, updateSettings, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated || !settings.customEndpoint) return;
    const result = validateEndpoint(settings.customEndpoint);
    if (!result.ok) {
      updateSettings({ customEndpoint: DEFAULT_API_ENDPOINT });
      addToast('接口地址已重置为默认值（仅支持 https 且不允许用户名/密码或参数）', 'info');
      return;
    }
    if (result.normalized && result.normalized !== settings.customEndpoint) {
      updateSettings({ customEndpoint: result.normalized });
    }
  }, [addToast, settings.customEndpoint, updateSettings, hasHydrated]);

  // Theme handling
  useEffect(() => {
    const root = window.document.documentElement;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemTheme.matches);
      if (isDark) {
        root.classList.add('dark');
        // Update theme-color for PWA/Browser bar
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')?.setAttribute('content', '#030712');
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')?.setAttribute('content', '#030712');
      } else {
        root.classList.remove('dark');
        // Update theme-color for PWA/Browser bar
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')?.setAttribute('content', '#ffffff');
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')?.setAttribute('content', '#ffffff');
      }
    };

    applyTheme();
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  if (!mounted) return null;

  return (
    <div className="flex h-dvh w-full flex-col bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text overflow-hidden relative transition-colors duration-200">
      <SessionManager />
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border bg-white/80 dark:bg-dark-surface/80 px-2 xs:px-3 sm:px-4 lg:px-6 py-2 xs:py-3 sm:py-4 backdrop-blur-md z-10 transition-colors duration-200 pt-safe shrink-0">
        <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-3">
          <img src="/logo.png" alt="Logo" className="h-6 w-6 xs:h-7 xs:w-7 sm:h-8 sm:w-8 lg:h-9 lg:w-9 object-contain" />
          <div className="hidden xs:block">
            <h1 className="text-sm xs:text-base sm:text-lg lg:text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">DEAI</h1>
            <p className="text-[10px] xs:text-xs text-gray-500 dark:text-gray-400 hidden md:block">
              从一句话开始的图像创作
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 xs:gap-1 sm:gap-2">
          {/* Credits Display - Show when authenticated */}
          {isAuthenticated && user && (
            <div className="hidden md:flex items-center gap-1.5 sm:gap-2 mr-1">
              <div
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-1 xs:gap-1.5 px-2 xs:px-3 py-1 xs:py-1.5 rounded-md xs:rounded-lg bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 text-xs xs:text-sm font-medium text-amber-700 dark:text-amber-400 cursor-pointer hover:from-amber-200 hover:to-orange-200 dark:hover:from-amber-900/50 dark:hover:to-orange-900/50 transition touch-feedback"
                title="点击查看次数详情"
              >
                <Coins className="h-3.5 w-3.5 xs:h-4 xs:w-4" />
                <span className="hidden sm:inline">{user.credit_balance} 次</span>
                <span className="sm:hidden font-numeric">{user.credit_balance}</span>
              </div>
              <button
                onClick={() => setShowPaymentPage(true)}
                className="flex items-center gap-0.5 xs:gap-1 px-1.5 xs:px-2 py-1 xs:py-1.5 rounded-md xs:rounded-lg bg-green-100 dark:bg-green-900/30 text-[10px] xs:text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition touch-feedback"
                title="购买积分"
              >
                <CreditCard className="h-3 w-3 xs:h-3.5 xs:w-3.5" />
                <span className="hidden lg:inline">充值</span>
              </button>
            </div>
          )}

          {/* Legacy Balance Display - Only show when has API key and not authenticated */}
          {!isAuthenticated && apiKey && balance && (
            <div
              onClick={() =>
                fetchBalance().catch((error) => {
                  const message = error instanceof Error ? error.message : '余额查询失败';
                  addToast(`余额查询失败: ${message}`, 'error');
                })
              }
              className="hidden sm:flex items-center gap-1 xs:gap-1.5 px-2 xs:px-3 py-1 xs:py-1.5 rounded-md xs:rounded-lg bg-gray-100 dark:bg-gray-800 text-xs xs:text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition mr-1 xs:mr-2 touch-feedback"
              title="点击刷新余额"
            >
              <DollarSign className="h-3.5 w-3.5 xs:h-4 xs:w-4 text-green-600 dark:text-green-500" />
              <span className={`hidden sm:inline ${balance.remaining < 1 ? "text-red-500" : ""}`}>
                {formatBalance(balance.remaining, balance.isUnlimited)}
              </span>
            </div>
          )}

          {/* New Chat Button */}
          <button
            onClick={() => {
              const handleClear = async () => {
                if (isAuthenticated) {
                  await createNewConversation();
                }
                clearHistory();
                addToast(isAuthenticated ? '已开始新对话' : '会话已清空', 'success');
              };

              showDialog({
                title: isAuthenticated ? '开始新对话' : '清空会话',
                message: isAuthenticated ? '确定要开始一个新对话吗？' : '确定要清空当前会话历史吗？',
                confirmLabel: isAuthenticated ? '新对话' : '清空',
                cancelLabel: '取消',
                onConfirm: handleClear
              });
            }}
            className="flex items-center justify-center p-1.5 xs:p-2 sm:px-3 sm:py-1.5 rounded-md xs:rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition touch-feedback"
            title={isAuthenticated ? "开始新对话" : "清空会话"}
          >
            <Plus className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline text-xs xs:text-sm font-medium ml-0.5 xs:ml-1">
              {isAuthenticated ? "新对话" : "清空"}
            </span>
          </button>

          {/* Conversation History Button */}
          {canUseHistory && (
            <button
              onClick={() => setIsConversationHistoryOpen(true)}
              className="rounded-md xs:rounded-lg p-1.5 xs:p-2 text-amber-600 dark:text-amber-400 transition hover:bg-amber-100 dark:hover:bg-amber-900/30 focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback"
              title="对话历史"
            >
              <MessageSquare className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-5 sm:w-5" />
            </button>
          )}

          {installPrompt && (
            <button
              onClick={handleInstallClick}
              className="rounded-md xs:rounded-lg p-1.5 xs:p-2 text-amber-600 dark:text-amber-400 transition hover:bg-amber-100 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback"
              title="安装应用"
            >
              <Download className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6 animate-attract" />
            </button>
          )}

          {/* Admin Panel button */}
          {isAuthenticated && user?.is_admin && (
            <a
              href="/admin/"
              className="relative rounded-md xs:rounded-lg p-1.5 xs:p-2 text-purple-600 dark:text-purple-400 transition hover:bg-purple-100 dark:hover:bg-purple-900/30 focus:outline-none focus:ring-2 focus:ring-purple-500 touch-feedback"
              title="管理后台"
            >
              <ShieldCheck className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
              {adminUnreadCount > 0 && (
                <span className="absolute top-0.5 xs:top-1 right-0.5 xs:right-1 flex h-1.5 xs:h-2 w-1.5 xs:w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 xs:h-2 w-1.5 xs:w-2 bg-red-500"></span>
                </span>
              )}
            </a>
          )}

          {isAuthenticated && ( // 3. Add Header button
            <button
              onClick={() => setShowTicketModal(true)}
              className="relative rounded-md xs:rounded-lg p-1.5 xs:p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 touch-feedback"
              title="提交工单/反馈"
            >
              <MessageCircle className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
              {ticketUnreadCount > 0 && (
                <span className="absolute top-0.5 xs:top-1 right-0.5 xs:right-1 flex h-1.5 xs:h-2 w-1.5 xs:w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 xs:h-2 w-1.5 xs:w-2 bg-red-500"></span>
                </span>
              )}
            </button>
          )}

          {/* Login/User button */}
          {isAuthenticated ? (
            <div className="flex items-center gap-0.5 xs:gap-1">
              <button
                onClick={() => setShowAuthModal(true)}
                className="rounded-md xs:rounded-lg p-1.5 xs:p-2 text-amber-600 dark:text-amber-400 transition hover:bg-amber-100 dark:hover:bg-amber-900/30 focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback"
                title={user?.nickname || user?.email || '账户'}
              >
                <User className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
              </button>
              <button
                onClick={() => {
                  showDialog({
                    title: '退出登录',
                    message: '确定要退出登录吗？',
                    confirmLabel: '退出',
                    cancelLabel: '取消',
                    onConfirm: () => {
                      logout();
                      addToast('已退出登录', 'success');
                    }
                  });
                }}
                className="rounded-md xs:rounded-lg p-1.5 xs:p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback"
                title="退出登录"
              >
                <LogOut className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1 xs:gap-1.5 px-2 xs:px-3 py-1 xs:py-1.5 rounded-md xs:rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs xs:text-sm font-medium hover:from-blue-600 hover:to-purple-600 transition touch-feedback"
              title="登录/注册"
            >
              <User className="h-3.5 w-3.5 xs:h-4 xs:w-4" />
              <span className="hidden sm:inline">登录</span>
            </button>
          )}

          {/* API Key button - Only show when not authenticated */}
          {!isAuthenticated && (
            <button
              onClick={() => setShowApiKeyModal(true)}
              className="rounded-md xs:rounded-lg p-1.5 xs:p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback"
              title={apiKey ? "更换 API Key" : "设置 API Key"}
            >
              <Key className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
            </button>
          )}

          {(apiKey || isAuthenticated) && (
            <>
              <button
                onClick={() => setIsImageHistoryOpen(true)}
                className="relative rounded-md xs:rounded-lg p-1.5 xs:p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback"
                title="图片历史"
              >
                <ImageIcon className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
                {imageHistory.length > 0 && (
                  <span className="absolute top-0.5 xs:top-1 right-0.5 xs:right-1 flex h-1.5 xs:h-2 w-1.5 xs:w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 xs:h-2 w-1.5 xs:w-2 bg-amber-500"></span>
                  </span>
                )}
              </button>
              <button
                onClick={togglePromptLibrary}
                className={`flex items-center gap-1 xs:gap-1.5 rounded-md xs:rounded-lg px-2 xs:px-3 py-1.5 xs:py-2 transition focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback ${isPromptLibraryOpen
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                  }`}
                title="提示词库"
              >
                <Sparkles className="h-4.5 w-4.5 xs:h-5 xs:w-5" />
                <span className="text-xs xs:text-sm font-medium hidden sm:inline">提示词</span>
              </button>
            </>
          )}

          <button
            onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            className="rounded-md xs:rounded-lg p-1.5 xs:p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback"
            title="切换主题"
          >
            {settings.theme === 'dark' ? <Sun className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" /> : <Moon className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />}
          </button>

          <button
            onClick={toggleSettings}
            className={`rounded-md xs:rounded-lg p-1.5 xs:p-2 transition focus:outline-none focus:ring-2 focus:ring-amber-500 touch-feedback ${isSettingsOpen
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            title="设置"
          >
            <Settings className="h-4.5 w-4.5 xs:h-5 xs:w-5 sm:h-6 sm:w-6" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-row min-h-0">
        {/* Conversation History Sidebar */}
        {canUseHistory && (
          <ConversationHistoryPanel
            isOpen={isConversationHistoryOpen}
            isCollapsed={isConversationHistoryCollapsed}
            onClose={() => setIsConversationHistoryOpen(false)}
            onToggleCollapse={() => setIsConversationHistoryCollapsed(!isConversationHistoryCollapsed)}
            onSelectConversation={async (id) => {
              await loadConversation(id);
            }}
            onNewConversation={async () => {
              await createNewConversation();
              clearHistory();
              addToast('已开始新对话', 'success');
            }}
          />
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatInterface />
        </div>

        {/* Settings Sidebar (Desktop/Mobile Overlay) */}
        <div
          className={`
            absolute inset-0 z-20 flex justify-end
            transition-all duration-300 ease-in-out
            ${isSettingsOpen
              ? 'bg-black/50 backdrop-blur-sm pointer-events-auto'
              : 'bg-transparent backdrop-blur-none pointer-events-none'
            }
            
            md:static md:z-auto md:bg-transparent md:backdrop-blur-none md:pointer-events-auto md:overflow-hidden
            md:transition-[width,border-color]
            ${isSettingsOpen
              ? 'md:w-80 md:border-l md:border-gray-200 dark:md:border-gray-800'
              : 'md:w-0 md:border-l-0 md:border-transparent'
            }
          `}
          onClick={() => {
            // Close on backdrop click (mobile only)
            if (window.innerWidth < 768 && isSettingsOpen) {
              toggleSettings();
            }
          }}
        >
          <div
            className={`
               w-[90%] max-w-sm h-full md:w-80 bg-white dark:bg-gray-950
               shadow-2xl md:shadow-none
               overflow-y-auto overflow-x-hidden border-l border-gray-200 dark:border-gray-800 md:border-none

               transition-transform duration-300 ease-in-out
               ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}
               md:translate-x-0
             `}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 sm:p-4 w-full">
              <Suspense fallback={<div className="p-4 text-center text-gray-500">加载中...</div>}>
                <SettingsPanel />
              </Suspense>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <Suspense fallback={null}>
        {showApiKeyModal && (
          <ApiKeyModal
            onClose={() => setShowApiKeyModal(false)}
            onSkip={handleSkipApiKeyPrompt}
          />
        )}
        {isImageHistoryOpen && (
          <ImageHistoryPanel isOpen={isImageHistoryOpen} onClose={() => setIsImageHistoryOpen(false)} />
        )}
        <PromptLibraryPanel />
      </Suspense>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Ticket Modal */}
      {isAuthenticated && (
        <TicketModal isOpen={showTicketModal} onClose={() => setShowTicketModal(false)} />
      )}

      {/* Payment Page */}
      {isAuthenticated && showPaymentPage && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950">
          <PaymentPage onClose={() => setShowPaymentPage(false)} />
        </div>
      )}

      <ToastContainer />
      <GlobalDialog />

      {/* 悬浮微信群按钮 */}
      <button
        onClick={() => setShowFloatingWeChatQR(true)}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 group"
        title="加入交流群"
      >
        <MessageCircle className="h-6 w-6 sm:h-7 sm:w-7" />
        <span className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
          加入交流群
        </span>
      </button>
      <WeChatQRModal isOpen={showFloatingWeChatQR} onClose={() => setShowFloatingWeChatQR(false)} />

      {/* 首次访问欢迎弹窗 */}
      <WelcomeModal isOpen={showWelcome} onClose={() => setShowWelcome(false)} />
    </div>
  );
};

export default App;
