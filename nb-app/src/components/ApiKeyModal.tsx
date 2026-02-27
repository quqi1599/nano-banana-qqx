import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import { Key, ChevronDown, ChevronRight, Settings2, X, MessageCircle, Globe, AlertTriangle } from 'lucide-react';
import { WeChatQRModal } from './WeChatQRModal';
import { DEFAULT_API_ENDPOINT } from '../config/api';
import { DEFAULT_MODEL_NAME, normalizeImageModelName } from '../constants/modelProfiles';

interface ApiKeyModalProps {
  onClose?: () => void;
  onSkip?: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onClose, onSkip }) => {
  const { apiKey, setApiKey, updateSettings, settings } = useAppStore();
  const { showDialog } = useUiStore();
  const [inputKey, setInputKey] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [model, setModel] = useState(normalizeImageModelName(settings.modelName || DEFAULT_MODEL_NAME));
  const [showWeChatQR, setShowWeChatQR] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState(settings.customEndpoint || DEFAULT_API_ENDPOINT);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [renderDisclaimer, setRenderDisclaimer] = useState(false);
  const [disclaimerVisible, setDisclaimerVisible] = useState(false);
  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  // Sync local state with store settings (e.g. when updated via URL params)
  useEffect(() => {
    if (settings.modelName) setModel(normalizeImageModelName(settings.modelName));
  }, [settings.modelName]);

  useEffect(() => {
    setCustomEndpoint(settings.customEndpoint || DEFAULT_API_ENDPOINT);
  }, [settings.customEndpoint]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (showDisclaimer) {
      setRenderDisclaimer(true);
      const frame = window.requestAnimationFrame(() => setDisclaimerVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    if (renderDisclaimer) {
      setDisclaimerVisible(false);
      const timer = window.setTimeout(() => setRenderDisclaimer(false), 200);
      return () => window.clearTimeout(timer);
    }
  }, [showDisclaimer, renderDisclaimer]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const requestClose = (callback?: () => void) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    setShowWeChatQR(false);
    setShowDisclaimer(false);
    setIsVisible(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      callback?.();
    }, 200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = inputKey.trim();
    const effectiveKey = trimmedKey || apiKey?.trim() || '';
    if (!effectiveKey) return;

    // 检查是否修改了自定义中转接口
    const newEndpoint = customEndpoint.trim() || DEFAULT_API_ENDPOINT;
    const currentEndpoint = settings.customEndpoint || DEFAULT_API_ENDPOINT;
    const isEndpointChanged = newEndpoint !== currentEndpoint;
    const isCustomEndpoint = newEndpoint !== DEFAULT_API_ENDPOINT;

    // 如果修改为自定义接口且未接受免责声明，显示免责声明
    if (isEndpointChanged && isCustomEndpoint && !hasAcceptedDisclaimer) {
      setShowDisclaimer(true);
      return;
    }

    // 更新设置
    updateSettings({
      modelName: normalizeImageModelName(model),
      customEndpoint: isCustomEndpoint ? newEndpoint : undefined,
    });
    setApiKey(effectiveKey);

    if (onClose) {
      requestClose(onClose);
    }
  };

  const handleAcceptDisclaimer = () => {
    setHasAcceptedDisclaimer(true);
    setShowDisclaimer(false);

    const newEndpoint = customEndpoint.trim() || DEFAULT_API_ENDPOINT;
    const effectiveKey = inputKey.trim() || apiKey?.trim() || '';
    const isCustomEndpoint = newEndpoint !== DEFAULT_API_ENDPOINT;

    updateSettings({
      modelName: normalizeImageModelName(model),
      customEndpoint: isCustomEndpoint ? newEndpoint : undefined,
    });
    setApiKey(effectiveKey);

    if (onClose) {
      requestClose(onClose);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm px-4 no-select transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className={`w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl p-4 sm:p-8 modal-mobile-padding touch-manipulation transition-all duration-200 relative ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        {/* Close button (only show if onClose provided) */}
        {onClose && (
          <button
            onClick={() => requestClose(onClose)}
            className="absolute top-4 right-4 p-3 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-cream-50 dark:bg-cream-500/10 p-4 ring-1 ring-cream-200 dark:ring-cream-500/50">
            <Key className="h-8 w-8 text-cream-600 dark:text-cream-500" />
          </div>
        </div>

        <h2 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-white">配置 API</h2>
        <p className="mb-6 text-sm text-center text-gray-500 dark:text-gray-400">
          您的 API Key 仅存储在本地浏览器中。也可登录使用次数模式。
        </p>


        <form onSubmit={handleSubmit} className="space-y-4">
          {/* API Key */}
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              API Key
            </label>
            <input
              type="password"
              id="apiKey"
              value={inputKey}
              onChange={(e) => setInputKey(e.currentTarget.value)}
              className="w-full rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-cream-500 focus:outline-none focus:ring-1 focus:ring-cream-500 transition"
              placeholder="sk-xxx..."
              autoFocus
            />
            {apiKey && (
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                已保存 API Key，留空可仅更新接口或模型。
              </p>
            )}
          </div>

          {/* Advanced Settings */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="group flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500 transition-all"
            >
              <div className="flex items-center gap-2 group-hover:text-cream-600 dark:group-hover:text-cream-400 group-hover:underline">
                <Settings2 className="h-3 w-3" />
                <span>高级配置</span>
                {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </div>
            </button>

            <div
              className={`grid transition-all duration-300 ease-in-out ${showAdvanced ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
            >
              <div className="overflow-hidden">
                <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                  {/* Custom Endpoint */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">中转接口地址</label>
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={customEndpoint}
                        onChange={(e) => setCustomEndpoint(e.currentTarget.value)}
                        className="flex-1 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:border-cream-500 focus:outline-none"
                        placeholder={DEFAULT_API_ENDPOINT}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">
                      默认使用官方接口，可修改为自定义中转服务
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.currentTarget.value)}
                      className="w-full rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:border-cream-500 focus:outline-none"
                      placeholder="gemini-3-pro-image-preview"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      如不清楚请保持默认
                    </p>
                  </div>

                  {/* Beta Features Warning */}
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">Beta 功能</span>
                      <span className="text-xs text-gray-400">谨慎开启</span>
                    </div>

                    {/* Google Search Grounding */}
                    <div className="mb-3">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-300">Google 搜索定位</span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={settings.useGrounding}
                            onChange={(e) => updateSettings({ useGrounding: e.currentTarget.checked })}
                            className="sr-only peer"
                          />
                          <div className="h-5 w-9 rounded-full bg-gray-200 dark:bg-gray-700 peer-focus:ring-2 peer-focus:ring-cream-500/50 peer-checked:bg-cream-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                        </div>
                      </label>
                      <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                        允许 Gemini 通过 Google 搜索获取实时信息
                      </p>
                    </div>

                    {/* Thinking Process */}
                    <div>
                      <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-300">显示思考过程</span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={settings.enableThinking}
                            onChange={(e) => updateSettings({ enableThinking: e.currentTarget.checked })}
                            className="sr-only peer"
                          />
                          <div className="h-5 w-9 rounded-full bg-gray-200 dark:bg-gray-700 peer-focus:ring-2 peer-focus:ring-cream-500/50 peer-checked:bg-cream-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                        </div>
                      </label>
                      <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                        显示模型的内部思考过程。部分模型不支持此功能
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!inputKey.trim() && !apiKey?.trim()}
            className="w-full rounded-lg bg-cream-600 px-4 py-3 font-semibold text-white transition hover:bg-cream-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            开始创作
          </button>

          {onSkip && (
            <button
              type="button"
              onClick={() => requestClose(onSkip)}
              className="w-full mt-2 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              暂不输入
            </button>
          )}

          {/* 加入交流群链接 */}
          <button
            type="button"
            onClick={() => setShowWeChatQR(true)}
            className="w-full mt-3 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition"
          >
            <MessageCircle className="h-4 w-4" />
            <span>加入交流群 🍌</span>
          </button>
        </form>

        {/* 微信二维码弹窗 */}
        <WeChatQRModal isOpen={showWeChatQR} onClose={() => setShowWeChatQR(false)} />

        {/* 自定义中转接口免责声明弹窗 */}
        {renderDisclaimer && (
          <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 transition-opacity duration-200 ${disclaimerVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className={`w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl p-6 transition-all duration-200 ${disclaimerVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">重要提示</h3>
              </div>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400 mb-6">
                <p>您即将使用自定义的中转接口地址，请注意：</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>服务由第三方提供，与本平台无关</li>
                  <li>服务稳定性和可用性由第三方决定</li>
                  <li>您的对话内容将发送至第三方服务器</li>
                  <li>产生的问题本平台不承担责任</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDisclaimer(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleAcceptDisclaimer}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-cream-500 hover:bg-cream-600 text-white transition text-sm font-medium"
                >
                  我已了解
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
