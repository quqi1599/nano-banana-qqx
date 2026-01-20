import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import { useAuthStore } from '../store/useAuthStore';
import { X, LogOut, Trash2, Share2, Bookmark, DollarSign, RefreshCw, Download, MessageCircle, Coins } from 'lucide-react';
import { formatBalance } from '../services/balanceService';
import { getModelPricing, ModelPricingInfo } from '../services/modelPricingService';
import { WeChatQRModal } from './WeChatQRModal';
export const SettingsPanel: React.FC = () => {
  const { apiKey, settings, updateSettings, toggleSettings, removeApiKey, clearHistory, isSettingsOpen, fetchBalance, balance, installPrompt, setInstallPrompt, usageCount } = useAppStore();
  const { addToast, showDialog, setShowAuthModal } = useUiStore();
  const { isAuthenticated, user, refreshCredits } = useAuthStore();
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [showWeChatQR, setShowWeChatQR] = useState(false);
  const [modelPricing, setModelPricing] = useState<ModelPricingInfo[]>([]);

  // 获取模型定价（登录用户）
  useEffect(() => {
    if (isAuthenticated) {
      getModelPricing()
        .then(setModelPricing)
        .catch(() => {
          // 静默失败，不影响用户体验
        });
    } else {
      setModelPricing([]);
    }
  }, [isAuthenticated]);

  // 获取指定模型的积分价格
  const getModelPrice = (modelName: string): number | null => {
    const pricing = modelPricing.find(p => p.model_name === modelName);
    return pricing?.credits_per_request ?? null;
  };

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

  // 余额查询不再自动触发，用户可以手动点击刷新按钮

  const handleFetchBalance = async () => {
    if (!apiKey) {
      addToast("请先输入 API Key", 'error');
      return;
    }

    setLoadingBalance(true);
    setBalanceError(null);
    try {
      await fetchBalance();
      addToast("余额查询成功", 'success');
    } catch (error: any) {
      const message = error?.message || '余额查询失败';
      setBalanceError(message);
      addToast(`余额查询失败: ${message}`, 'error');
    } finally {
      setLoadingBalance(false);
    }
  };

  // 刷新登录用户积分
  const handleRefreshCredits = async () => {
    setLoadingCredits(true);
    setBalanceError(null);
    try {
      await refreshCredits();
      addToast("积分刷新成功", 'success');
    } catch (error: any) {
      const message = error?.message || '积分刷新失败';
      setBalanceError(message);
      addToast(`积分刷新失败: ${message}`, 'error');
    } finally {
      setLoadingCredits(false);
    }
  };

  const getBookmarkUrl = () => {
    const params = new URLSearchParams();
    if (settings.customEndpoint) params.set('endpoint', settings.customEndpoint);
    if (settings.modelName) params.set('model', settings.modelName);
    const query = params.toString();
    return `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`;
  };

  const handleCreateBookmark = () => {
    if (!apiKey) return;
    const url = getBookmarkUrl();

    // Update address bar without reloading
    window.history.pushState({ path: url }, '', url);

    // Copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
      addToast("URL 已更新并复制（不包含 API Key）。按 Ctrl+D 添加书签。", 'success');
    }).catch(err => {
      console.error("复制失败", err);
      showDialog({
        type: 'alert',
        title: '复制失败',
        message: `请手动复制此 URL：\n${url}`,
        onConfirm: () => { }
      });
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-white dark:bg-gray-950 z-10 pb-2">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">设置</h2>
        <button onClick={toggleSettings} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg sm:hidden">
          <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      <div className="space-y-4 sm:space-y-8 flex-1 overflow-y-auto pb-safe scroll-smooth-touch">
        {/* Balance Section - 登录用户显示积分 */}
        {isAuthenticated ? (
          <section className="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-amber-50 to-white dark:from-gray-900 dark:to-gray-800 border border-amber-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">我的灵感</h3>
              </div>
              <button
                onClick={handleRefreshCredits}
                disabled={loadingCredits}
                className="p-1 sm:p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-800/30 text-amber-600 dark:text-amber-400 disabled:opacity-50 transition"
                title="刷新积分"
              >
                <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loadingCredits ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingCredits ? (
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center py-2 sm:py-3">
                刷新中...
              </div>
            ) : (
              <div>
                <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {user?.credit_balance?.toLocaleString() || '0'}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">
                    可用灵感
                  </div>
                </div>
                {balanceError && (
                  <div className="mt-2 text-[10px] sm:text-xs text-center text-red-600 dark:text-red-400">
                    {balanceError}
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          /* Balance Section - 未登录用户显示登录提示 */
          <section className="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-amber-50 to-white dark:from-gray-900 dark:to-gray-800 border border-amber-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
              <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">我的灵感</h3>
            </div>

            <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-3 sm:p-4 text-center">
              <div className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                登录可见灵感值
              </div>
            </div>

            <div className="mt-3 text-center">
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 text-white font-medium text-xs sm:text-sm shadow-md hover:shadow-lg transition-all"
              >
                立即登录
              </button>
            </div>
          </section>
        )}

        {/* Resolution */}
        <section>
          <label className="block text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">图像分辨率</label>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {(['1K', '2K', '4K'] as const).map((res) => {
              // 只有 gemini-3-pro-image-preview 支持分辨率选择
              const isResolutionSupported = (settings.modelName || 'gemini-3-pro-image-preview') === 'gemini-3-pro-image-preview';
              const isDisabled = !isResolutionSupported;

              return (
                <button
                  key={res}
                  onClick={() => {
                    if (isDisabled) return;
                    if (res === '2K' || res === '4K') {
                      updateSettings({ resolution: res, streamResponse: false });
                    } else {
                      updateSettings({ resolution: res });
                    }
                  }}
                  disabled={isDisabled}
                  className={`rounded-lg border px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition ${settings.resolution === res
                    ? 'border-cream-500 bg-cream-50 dark:bg-cream-500/10 text-cream-600 dark:text-cream-400'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'
                    } ${isDisabled ? 'opacity-40 cursor-not-allowed hover:border-gray-200 dark:hover:border-gray-800' : ''}`}
                >
                  {res}
                </button>
              );
            })}
          </div>
          {(settings.modelName || 'gemini-3-pro-image-preview') !== 'gemini-3-pro-image-preview' && (
            <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-1.5 sm:mt-2">
              ⚠️ 当前模型不支持分辨率选择，仅 Gemini 3 Pro 支持此功能
            </p>
          )}
        </section>

        {/* Model Selection */}
        <section>
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <label className="block text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">模型选择</label>
            {isAuthenticated && modelPricing.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-amber-600 dark:text-amber-400">
                <Coins className="h-3 w-3" />
                <span>登录可见灵感值</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {([
              { name: 'gemini-3-pro-image-preview', label: 'Banana Pro (3.0模型)' },
              { name: 'gemini-2.5-flash-image', label: 'Banana (2.5模型)' }
            ] as const).map((model) => {
              const isActive = (settings.modelName || 'gemini-3-pro-image-preview') === model.name;
              return (
                <button
                  key={model.name}
                  onClick={() => updateSettings({ modelName: model.name })}
                  className={`w-full rounded-lg border px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-left transition ${isActive
                    ? 'border-cream-500 bg-cream-50 dark:bg-cream-500/10 text-cream-600 dark:text-cream-400'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                >
                  {model.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Aspect Ratio */}
        <section>
          <label className="block text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">长宽比</label>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {(['Auto', '1:1', '3:4', '4:3', '9:16', '16:9', '21:9'] as const).map((ratio) => {
              const isActive = settings.aspectRatio === ratio;
              const ratioPreviewStyles: Record<string, string> = {
                'Auto': 'w-6 h-6 border-dashed',
                '1:1': 'w-6 h-6',
                '3:4': 'w-5 h-7',
                '4:3': 'w-7 h-5',
                '9:16': 'w-4 h-7',
                '16:9': 'w-7 h-4',
                '21:9': 'w-8 h-3',
              };

              return (
                <button
                  key={ratio}
                  onClick={() => updateSettings({ aspectRatio: ratio })}
                  className={`flex flex-col items-center justify-center gap-1 sm:gap-2 rounded-lg border p-2 sm:p-3 transition ${isActive
                    ? 'border-cream-500 bg-cream-50 dark:bg-cream-500/10 text-cream-600 dark:text-cream-400'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'
                    }`}
                >
                  <div
                    className={`rounded-sm border-2 ${isActive ? 'border-cream-400 bg-cream-100 dark:bg-cream-400/20' : 'border-gray-400 dark:border-gray-600 bg-gray-200 dark:bg-gray-800'
                      } ${ratioPreviewStyles[ratio]}`}
                  />
                  <span className="text-[10px] sm:text-xs font-medium">{ratio}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Streaming */}
        <section>
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">流式响应</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={settings.streamResponse}
                onChange={(e) => {
                  const checked = (e.target as HTMLInputElement).checked;
                  if (checked && (settings.resolution === '2K' || settings.resolution === '4K')) {
                    showDialog({
                      type: 'confirm',
                      title: '潜在问题',
                      message: "警告：2K 或 4K 分辨率配合流式传输可能会导致内容不完整。是否继续？",
                      confirmLabel: "仍然启用",
                      onConfirm: () => updateSettings({ streamResponse: true })
                    });
                  } else {
                    updateSettings({ streamResponse: checked });
                  }
                }}
                className="sr-only peer"
              />
              <div className="h-5 w-9 sm:h-6 sm:w-11 rounded-full bg-gray-200 dark:bg-gray-800 peer-focus:ring-2 peer-focus:ring-cream-500/50 peer-checked:bg-cream-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 sm:after:h-5 sm:after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
            </div>
          </label>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">
            逐个 token 流式传输模型的响应。对于一次性响应请禁用。
          </p>
        </section>

        {/* Conversation Context */}
        <section>
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">发送对话上下文</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={settings.sendHistory}
                onChange={(e) => updateSettings({ sendHistory: e.currentTarget.checked })}
                className="sr-only peer"
              />
              <div className="h-5 w-9 sm:h-6 sm:w-11 rounded-full bg-gray-200 dark:bg-gray-800 peer-focus:ring-2 peer-focus:ring-cream-500/50 peer-checked:bg-cream-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 sm:after:h-5 sm:after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
            </div>
          </label>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">
            开启后会把当前对话历史一起发送给模型；关闭则仅发送本次输入。
          </p>
        </section>

        {/* App Installation */}
        {installPrompt && (
          <section className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border border-cream-200 dark:border-cream-500/30 bg-cream-50 dark:bg-cream-500/10 p-2.5 sm:p-3 text-cream-600 dark:text-cream-400 hover:bg-cream-100 dark:hover:bg-cream-500/20 transition"
            >
              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">安装 nbnb 应用</span>
            </button>
            <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-center text-gray-400 dark:text-gray-500">
              安装到您的设备以获得原生应用体验。
            </p>
          </section>
        )}

        {/* Share Configuration */}
        <section className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex gap-1.5 sm:gap-2">
            <button
              onClick={handleCreateBookmark}
              className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-2.5 sm:p-3 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition"
            >
              <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-[10px] sm:text-xs">更新 URL</span>
            </button>

            <a
              href={getBookmarkUrl()}
              onClick={(e) => e.preventDefault()} // Prevent navigation, strictly for dragging
              className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 p-2.5 sm:p-3 text-gray-500 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 cursor-grab active:cursor-grabbing transition"
              title="将此按钮拖动到书签栏"
            >
              <Bookmark className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-[10px] sm:text-xs">拖动到书签</span>
            </a>
          </div>
        </section>

        {/* Data Management */}
        <section className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => {
              showDialog({
                type: 'confirm',
                title: '清除历史记录',
                message: "您确定要删除所有聊天记录吗？此操作无法撤销。",
                confirmLabel: "清除",
                onConfirm: () => {
                  clearHistory();
                  toggleSettings();
                  addToast("对话已清除", 'success');
                }
              });
            }}
            className="w-full flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/5 p-2.5 sm:p-3 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/10 transition mb-2 sm:mb-3"
          >
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">清除对话</span>
          </button>

          {apiKey && (
            <button
              onClick={() => {
                showDialog({
                  type: 'confirm',
                  title: '移除 API Key',
                  message: "您确定要移除您的 API Key 吗？您的聊天记录将被保留。",
                  confirmLabel: "移除",
                  onConfirm: () => {
                    removeApiKey();
                    addToast("API Key 已移除", 'info');
                  }
                });
              }}
              className="w-full flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-2.5 sm:p-3 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">清除 API Key</span>
            </button>
          )}
        </section>

        {/* 加入用户群 */}
        <section className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setShowWeChatQR(true)}
            className="w-full flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 p-2.5 sm:p-3 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 transition"
          >
            <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">加入用户交流群 🍌</span>
          </button>
        </section>

        {/* Info */}
        <div className="mt-1 pb-2 sm:pb-4 text-center text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-600 space-y-0.5 sm:space-y-1">
          <p>模型: {settings.modelName || 'gemini-3-pro-image-preview'}</p>
        </div>

        {/* 微信二维码弹窗 */}
        <WeChatQRModal isOpen={showWeChatQR} onClose={() => setShowWeChatQR(false)} />
      </div>
    </div>
  );
};
