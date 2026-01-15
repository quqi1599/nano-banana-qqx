import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import { Key, ChevronDown, ChevronRight, Settings2, X, MessageCircle } from 'lucide-react';
import { WeChatQRModal } from './WeChatQRModal';

interface ApiKeyModalProps {
  onClose?: () => void;
  onSkip?: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onClose, onSkip }) => {
  const { apiKey, setApiKey, updateSettings, settings } = useAppStore();
  const { showDialog } = useUiStore();
  const [inputKey, setInputKey] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [model, setModel] = useState(settings.modelName || 'gemini-3-pro-image-preview');
  const [showWeChatQR, setShowWeChatQR] = useState(false);

  // Sync local state with store settings (e.g. when updated via URL params)
  useEffect(() => {
    if (settings.modelName) setModel(settings.modelName);
  }, [settings.modelName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = inputKey.trim();
    const effectiveKey = trimmedKey || apiKey?.trim() || '';
    if (!effectiveKey) return;

    updateSettings({
      modelName: model
    });
    setApiKey(effectiveKey);
    // 余额可以在设置面板中手动刷新

    // 调用 onClose 如果提供
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl p-6 sm:p-8 transition-colors duration-200 relative">
        {/* Close button (only show if onClose provided) */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
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
              onClick={onSkip}
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

      </div>
    </div>
  );
};
