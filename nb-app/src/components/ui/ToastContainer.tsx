import React from 'react';
import { useUiStore } from '../../store/useUiStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useUiStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 w-full max-w-md px-4 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex items-start gap-3 rounded-xl p-4 shadow-xl border transition-all animate-in fade-in slide-in-from-top-4 duration-300
            ${
              toast.type === 'success'
                ? 'bg-white dark:bg-gray-800 border-green-200 dark:border-green-800/50'
                : toast.type === 'error'
                ? 'bg-white dark:bg-gray-800 border-red-200 dark:border-red-800/50 ring-2 ring-red-100 dark:ring-red-900/30'
                : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800/50'
            }
          `}
        >
          {/* 图标 */}
          <div className={`
            shrink-0 rounded-full p-1.5
            ${
              toast.type === 'success'
                ? 'bg-green-100 dark:bg-green-900/30'
                : toast.type === 'error'
                ? 'bg-red-100 dark:bg-red-900/30'
                : 'bg-blue-100 dark:bg-blue-900/30'
            }
          `}>
            {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />}
            {toast.type === 'error' && <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />}
            {toast.type === 'info' && <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
          </div>

          {/* 内容 */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
              {toast.message}
            </p>
            {toast.type === 'error' && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                请检查后重试，如问题持续请联系客服
              </p>
            )}
          </div>

          {/* 关闭按钮 */}
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
