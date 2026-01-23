import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface BaseDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  progress?: number;
  progressLabel?: string;
}

export type DialogOptions =
  | (BaseDialogOptions & {
      type?: 'confirm';
      onConfirm: () => void;
    })
  | (BaseDialogOptions & {
      type: 'alert';
      onConfirm?: () => void;
    });

export type BatchMode = 'off' | 'normal';

export interface PendingReferenceImage {
  base64Data: string;
  mimeType: string;
  timestamp: number;
}

// Toast 定时器管理器 - 防止内存泄漏
const toastTimers = new Map<string, NodeJS.Timeout>();

const scheduleToastRemoval = (id: string, callback: () => void) => {
  // 清除已存在的定时器（如果有的话）
  if (toastTimers.has(id)) {
    clearTimeout(toastTimers.get(id)!);
  }

  // 创建新的定时器
  const timer = setTimeout(() => {
    callback();
    toastTimers.delete(id);
  }, 3000);

  toastTimers.set(id, timer);
};

const clearToastTimer = (id: string) => {
  if (toastTimers.has(id)) {
    clearTimeout(toastTimers.get(id)!);
    toastTimers.delete(id);
  }
};

// 清理所有定时器（用于组件卸载时）
export const clearAllToastTimers = () => {
  toastTimers.forEach(timer => clearTimeout(timer));
  toastTimers.clear();
};

interface UiState {
  toasts: Toast[];
  dialog: DialogOptions | null;
  isPromptLibraryOpen: boolean;
  batchMode: BatchMode;
  batchCount: number;
  showApiKeyModal: boolean;
  showAuthModal: boolean;
  pendingReferenceImage: PendingReferenceImage | null;

  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  showDialog: (options: DialogOptions) => void;
  closeDialog: () => void;
  togglePromptLibrary: () => void;
  closePromptLibrary: () => void;
  setBatchMode: (mode: BatchMode) => void;
  setBatchCount: (count: number) => void;
  setShowApiKeyModal: (show: boolean) => void;
  setShowAuthModal: (show: boolean) => void;
  setPendingReferenceImage: (image: PendingReferenceImage | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  dialog: null,
  isPromptLibraryOpen: false,
  batchMode: 'off',
  batchCount: 1,
  showApiKeyModal: false,
  showAuthModal: false,
  pendingReferenceImage: null,

  addToast: (message, type = 'info') => {
    const id = Date.now().toString();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }));

    // 错误类型需要手动关闭，不自动消失
    // 成功和信息类型 3 秒后自动消失
    if (type !== 'error') {
      scheduleToastRemoval(id, () => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id)
        }));
      });
    }
  },

  removeToast: (id) => {
    // 清除定时器并移除 toast
    clearToastTimer(id);
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }));
  },

  showDialog: (options) => set({ dialog: options }),

  closeDialog: () => set({ dialog: null }),

  togglePromptLibrary: () =>
    set((state) => ({ isPromptLibraryOpen: !state.isPromptLibraryOpen })),

  closePromptLibrary: () => set({ isPromptLibraryOpen: false }),

  setBatchMode: (mode) => set({ batchMode: mode }),

  setBatchCount: (count) => set({ batchCount: Math.max(1, Math.min(4, count)) }),

  setShowApiKeyModal: (show) => set({ showApiKeyModal: show }),

  setShowAuthModal: (show) => set({ showAuthModal: show }),

  setPendingReferenceImage: (image) => set({ pendingReferenceImage: image }),
}));
