import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import { X, LogOut, Trash2, Share2, Bookmark, DollarSign, RefreshCw, Download, MessageCircle } from 'lucide-react';
import { formatBalance } from '../services/balanceService';
import { DEFAULT_API_ENDPOINT } from '../config/api';
import { WeChatQRModal } from './WeChatQRModal';
export const SettingsPanel: React.FC = () => {
  const { apiKey, settings, updateSettings, toggleSettings, removeApiKey, clearHistory, isSettingsOpen, fetchBalance, balance, installPrompt, setInstallPrompt, usageCount } = useAppStore();
  const { addToast, showDialog } = useUiStore();
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [showWeChatQR, setShowWeChatQR] = useState(false);
  const [customEndpointInput, setCustomEndpointInput] = useState(settings.customEndpoint || DEFAULT_API_ENDPOINT);
  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState(false);
  const [showEndpointDisclaimer, setShowEndpointDisclaimer] = useState(false);

  // 当 settings.customEndpoint 变化时，同步到输入框
  useEffect(() => {
    setCustomEndpointInput(settings.customEndpoint || DEFAULT_API_ENDPOINT);
  }, [settings.customEndpoint]);

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

  const handleCustomEndpointChange = (newValue: string) => {
    setCustomEndpointInput(newValue);
  };

  const handleSaveCustomEndpoint = () => {
    // 获取当前实际使用的 endpoint（考虑默认值情况）
    const currentEndpoint = settings.customEndpoint || DEFAULT_API_ENDPOINT;
    const newEndpoint = customEndpointInput.trim() || DEFAULT_API_ENDPOINT;

    if (newEndpoint === currentEndpoint) {
      return; // No change
    }

    // Show disclaimer if endpoint is different from default
    const isDefault = newEndpoint === DEFAULT_API_ENDPOINT;
    const isChangingToCustom = !isDefault;

    if (isChangingToCustom && !hasAcceptedDisclaimer) {
      setShowEndpointDisclaimer(true);
      return;
    }

    // Apply the change
    if (isDefault) {
      // Reset to default
      updateSettings({ customEndpoint: undefined });
      addToast("已恢复默认中转地址", 'success');
    } else {
      updateSettings({ customEndpoint: newEndpoint });
      addToast("中转地址已更新", 'success');
    }
  };

  const handleAcceptDisclaimer = () => {
    setHasAcceptedDisclaimer(true);
    setShowEndpointDisclaimer(false);
    // Apply the change
    const newEndpoint = customEndpointInput.trim() || DEFAULT_API_ENDPOINT;
    if (newEndpoint === DEFAULT_API_ENDPOINT) {
      updateSettings({ customEndpoint: undefined });
    } else {
      updateSettings({ customEndpoint: newEndpoint });
    }
    addToast("中转地址已更新", 'success');
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
        {/* Balance Section */}
        {apiKey && (
          <section className="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-cream-50 to-white dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">API 余额</h3>
              </div>
              <button
                onClick={handleFetchBalance}
                disabled={loadingBalance}
                className="p-1 sm:p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/30 text-blue-600 dark:text-blue-400 disabled:opacity-50 transition"
                title="刷新余额"
              >
                <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loadingBalance ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingBalance && !balance ? (
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center py-2 sm:py-3">
                查询中...
              </div>
            ) : balance ? (
              <div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-2 sm:p-2.5 text-center">
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1">总额度</div>
                    <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                      {formatBalance(balance.hardLimitUsd, balance.isUnlimited)}
                    </div>
                  </div>
                  <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-2 sm:p-2.5 text-center">
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1">已使用</div>
                    <div className="text-xs sm:text-sm font-bold text-orange-600 dark:text-orange-400 truncate">
                      {formatBalance(balance.usage, balance.isUnlimited)}
                    </div>
                  </div>
                  <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-2 sm:p-2.5 text-center">
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1">剩余</div>
                    <div className="text-xs sm:text-sm font-bold text-green-600 dark:text-green-400 truncate">
                      {formatBalance(balance.remaining, balance.isUnlimited)}
                    </div>
                  </div>
                </div>
                {balanceError && (
                  <div className="mt-2 text-[10px] sm:text-xs text-center space-y-1">
                    <div className="text-red-600 dark:text-red-400">
                      余额刷新失败: {balanceError}
                    </div>
                    {usageCount > 0 && (
                      <div className="text-gray-500 dark:text-gray-400">
                        本地已使用 {usageCount} 次
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 text-center py-1.5 sm:py-2 space-y-1">
                <div>点击刷新按钮查询余额</div>
                {usageCount > 0 && (
                  <div>本地已使用 {usageCount} 次</div>
                )}
                {balanceError && (
                  <div className="text-red-600 dark:text-red-400">
                    余额查询失败: {balanceError}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Custom Endpoint */}
        <section>
          <label className="block text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">中转接口地址</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customEndpointInput}
              onChange={(e) => handleCustomEndpointChange(e.target.value)}
              placeholder={DEFAULT_API_ENDPOINT}
              className="flex-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cream-500/50 focus:border-cream-500 transition"
            />
            <button
              onClick={handleSaveCustomEndpoint}
              disabled={(() => {
                const currentEndpoint = settings.customEndpoint || DEFAULT_API_ENDPOINT;
                const newEndpoint = customEndpointInput.trim() || DEFAULT_API_ENDPOINT;
                return newEndpoint === currentEndpoint;
              })()}
              className="px-3 py-2 rounded-lg bg-cream-500 hover:bg-cream-600 text-white text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
            >
              保存
            </button>
          </div>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">
            默认: {DEFAULT_API_ENDPOINT}
            {settings.customEndpoint && settings.customEndpoint !== DEFAULT_API_ENDPOINT && (
              <span className="text-amber-600 dark:text-amber-400 ml-1">（已自定义）</span>
            )}
          </p>
        </section>

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
          <label className="block text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">模型选择</label>
          <div className="space-y-2">
            {([
              { name: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview (第2代)' },
              { name: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (第1代)' }
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
          <p className="truncate px-4">接口地址: {DEFAULT_API_ENDPOINT}</p>
        </div>

        {/* 微信二维码弹窗 */}
        <WeChatQRModal isOpen={showWeChatQR} onClose={() => setShowWeChatQR(false)} />

        {/* 自定义中转接口免责声明弹窗 */}
        {showEndpointDisclaimer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEndpointDisclaimer(false)} />
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-auto">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  ⚠️ 重要免责声明
                </h3>
                <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                  <p>您即将使用自定义的中转接口地址，请注意：</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>服务来源：</strong>自定义接口的服务由第三方提供，与本平台无关</li>
                    <li><strong>稳定性：</strong>服务稳定性、可用性、速度均由第三方决定，我们无法保证</li>
                    <li><strong>数据安全：</strong>您的对话内容、图片数据将发送至第三方服务器，请自行评估风险</li>
                    <li><strong>费用：</strong>如产生费用，由第三方服务商收取，与本平台无关</li>
                    <li><strong>责任：</strong>使用自定义接口产生的一切问题，本平台不承担任何责任</li>
                  </ul>
                  <p className="text-amber-600 dark:text-amber-400 font-medium">
                    建议只使用您信任的、了解其服务条款的中转接口。
                  </p>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowEndpointDisclaimer(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAcceptDisclaimer}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-cream-500 hover:bg-cream-600 text-white font-medium transition"
                  >
                    我已了解，继续
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
