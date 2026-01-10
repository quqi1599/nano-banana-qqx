import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { get as getVal, set as setVal, del as delVal } from 'idb-keyval';
import { fetchBalance, BalanceInfo } from '../services/balanceService';
import {
    createConversation,
    getConversations,
    getConversation,
    addMessage as addMessageApi,
    updateConversationTitle,
    deleteConversation as deleteConversationApi,
    Conversation,
    ConversationMessage,
    MessageImage,
} from '../services/conversationService';
import { AppSettings, ChatMessage, Part, ImageHistoryItem } from '../types';
import { createThumbnail } from '../utils/imageUtils';
import { DEFAULT_API_ENDPOINT } from '../config/api';

// Custom IndexedDB storage
const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return await getVal(name) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await setVal(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await delVal(name);
  },
};

interface AppState {
  apiKey: string | null;
  settings: AppSettings;
  messages: ChatMessage[]; // Single Source of Truth
  imageHistory: ImageHistoryItem[]; // 图片历史记录
  endpointHistory: string[]; // API 接口地址历史记录
  isLoading: boolean;
  isSettingsOpen: boolean;
  inputText: string; // Global input text state
  balance: BalanceInfo | null;
  usageCount: number; // 使用次数（当余额API不可用时使用）
  installPrompt: any | null; // PWA Install Prompt Event

  // 对话历史相关
  currentConversationId: string | null;
  conversationList: Conversation[];
  isSyncing: boolean;

  setInstallPrompt: (prompt: any) => void;
  setApiKey: (key: string) => void;
  fetchBalance: () => Promise<void>;
  incrementUsageCount: () => void;
  resetUsageCount: () => void;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  addEndpointToHistory: (endpoint: string) => void; // 添加 API 地址到历史记录
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (parts: Part[], isError?: boolean, thinkingDuration?: number) => void;
  addImageToHistory: (image: ImageHistoryItem) => Promise<void>;
  deleteImageFromHistory: (id: string) => Promise<void>;
  clearImageHistory: () => Promise<void>;
  cleanInvalidHistory: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setInputText: (text: string) => void;
  toggleSettings: () => void;
  clearHistory: () => void;
  removeApiKey: () => void;
  deleteMessage: (id: string) => void;
  sliceMessages: (index: number) => void;

  // 对话历史方法
  createNewConversation: (title?: string) => Promise<string | null>;
  loadConversation: (id: string) => Promise<void>;
  loadConversationList: () => Promise<void>;
  syncCurrentMessage: (message: ChatMessage) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentConversationId: (id: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      apiKey: null,
      settings: {
        resolution: '1K',
        aspectRatio: 'Auto',
        useGrounding: false,
        enableThinking: false,
        streamResponse: true,
        customEndpoint: DEFAULT_API_ENDPOINT,
        modelName: 'gemini-3-pro-image-preview',
        theme: 'light',
      },
      messages: [],
      imageHistory: [], // 初始化图片历史记录
      endpointHistory: [], // 初始化 API 接口地址历史记录
      isLoading: false,
      isSettingsOpen: window.innerWidth > 640, // Open by default only on desktop (sm breakpoint)
      inputText: '',
      balance: null,
      usageCount: 0,
      installPrompt: null,

      // 对话历史状态
      currentConversationId: null,
      conversationList: [],
      isSyncing: false,

      setInstallPrompt: (prompt) => set({ installPrompt: prompt }),
      setApiKey: (key) => set({ apiKey: key }),

      fetchBalance: async () => {
        const { apiKey, settings } = get();
        if (!apiKey) return;
        try {
          const balance = await fetchBalance(apiKey, settings);
          set({ balance });
        } catch (error) {
          console.error('Failed to update balance:', error);
        }
      },

      incrementUsageCount: () => set((state) => ({ usageCount: state.usageCount + 1 })),

      resetUsageCount: () => set({ usageCount: 0 }),

      updateSettings: (newSettings) =>
        set((state) => ({ settings: { ...state.settings, ...newSettings } })),

      addEndpointToHistory: (endpoint) =>
        set((state) => {
          const trimmed = endpoint.trim();
          if (!trimmed) return {};
          // 移除重复项，将新地址放到最前面，最多保留 10 个
          const filtered = state.endpointHistory.filter((e) => e !== trimmed);
          return { endpointHistory: [trimmed, ...filtered].slice(0, 10) };
        }),

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      updateLastMessage: (parts, isError = false, thinkingDuration) =>
        set((state) => {
          const messages = [...state.messages];

          if (messages.length > 0) {
            messages[messages.length - 1] = {
              ...messages[messages.length - 1],
              parts: [...parts], // Create a copy to trigger re-renders
              isError: isError,
              ...(thinkingDuration !== undefined && { thinkingDuration })
            };
          }

          return { messages };
        }),

      addImageToHistory: async (image) => {
        // 分离存储：生成缩略图存入 State，原图存入 IDB
        let thumbnail = image.thumbnailData;
        if (!thumbnail && image.base64Data) {
          try {
            thumbnail = await createThumbnail(image.base64Data, image.mimeType);
          } catch (e) {
            console.error('Failed to create thumbnail', e);
          }
        }

        // 如果有原图数据，存入 IDB 并从 State 对象中移除
        if (image.base64Data) {
          try {
            await setVal(`image_data_${image.id}`, image.base64Data);
          } catch (e) {
            console.error('Failed to save image data to IDB', e);
          }
        }

        const newImageItem: ImageHistoryItem = {
          ...image,
          thumbnailData: thumbnail,
          base64Data: undefined // 不在 State 中存储原图
        };

        set((state) => {
          // 最多保留100张图片
          const newHistory = [newImageItem, ...state.imageHistory].slice(0, 100);

          // 如果超出了100张，需要清理被移除图片的 IDB 数据
          if (state.imageHistory.length >= 100) {
            const removed = state.imageHistory[99];
            if (removed) {
              delVal(`image_data_${removed.id}`).catch(console.error);
            }
          }

          return { imageHistory: newHistory };
        });
      },

      deleteImageFromHistory: async (id) => {
        // 清理 IDB 数据
        try {
          await delVal(`image_data_${id}`);
        } catch (e) {
          console.error('Failed to delete image data from IDB', e);
        }

        set((state) => ({
          imageHistory: state.imageHistory.filter((img) => img.id !== id),
        }));
      },

      clearImageHistory: async () => {
        const { imageHistory } = get();
        // 清理所有图片的 IDB 数据
        for (const img of imageHistory) {
          try {
            await delVal(`image_data_${img.id}`);
          } catch (e) {
            console.error(`Failed to delete image data ${img.id}`, e);
          }
        }
        set({ imageHistory: [] });
      },

      cleanInvalidHistory: async () => {
        const { imageHistory } = get();
        let hasChanges = false;

        const newHistoryPromises = imageHistory.map(async (img) => {
          // Case 1: 已经是新格式 (有缩略图)
          if (img.thumbnailData) {
            // 如果还有 base64Data，顺手清理并确保 IDB 有数据
            if (img.base64Data) {
              try {
                await setVal(`image_data_${img.id}`, img.base64Data);
              } catch (e) { console.error(e); }

              hasChanges = true;
              return { ...img, base64Data: undefined };
            }
            return img;
          }

          // Case 2: 旧格式 (无缩略图，有 base64Data) -> 迁移
          if (!img.thumbnailData && img.base64Data) {
            hasChanges = true;
            try {
              // 1. 生成缩略图
              const thumbnail = await createThumbnail(img.base64Data, img.mimeType);
              // 2. 存入 IDB
              await setVal(`image_data_${img.id}`, img.base64Data);

              // 3. 返回新结构
              return {
                ...img,
                thumbnailData: thumbnail,
                base64Data: undefined
              } as ImageHistoryItem;
            } catch (e) {
              console.error(`Failed to migrate image ${img.id}`, e);
              // 迁移失败，可能数据坏了，返回 null 标记删除
              return null;
            }
          }

          // Case 3: 坏数据 (无缩略图，无 base64Data) -> 删除
          hasChanges = true;
          // 尝试清理残留 IDB
          try {
            await delVal(`image_data_${img.id}`);
          } catch (e) { }
          return null;
        });

        const processedHistory = await Promise.all(newHistoryPromises);
        const validHistory = processedHistory.filter((img): img is ImageHistoryItem => img !== null);

        if (hasChanges || validHistory.length !== imageHistory.length) {
          set({ imageHistory: validHistory });
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setInputText: (text) => set({ inputText: text }),

      toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

      clearHistory: () => set({ messages: [] }),

      removeApiKey: () => set({ apiKey: null }),

      deleteMessage: (id) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === id);
          if (index === -1) return {};

          const newMessages = [...state.messages];
          newMessages.splice(index, 1);

          return { messages: newMessages };
        }),

      sliceMessages: (index) =>
        set((state) => ({
          messages: state.messages.slice(0, index + 1),
        })),

      // ============ 对话历史方法 ============

      setCurrentConversationId: (id) => set({ currentConversationId: id }),

      createNewConversation: async (title) => {
        try {
          const conv = await createConversation(title, get().settings.modelName);
          set({ currentConversationId: conv.id });
          await get().loadConversationList(); // 刷新列表
          return conv.id;
        } catch (error) {
          console.error('Failed to create conversation:', error);
          return null;
        }
      },

      loadConversation: async (id) => {
        try {
          const data = await getConversation(id);

          // 转换消息格式
          const messages: ChatMessage[] = data.messages.map((msg) => {
            const parts: Part[] = [];

            if (msg.is_thought) {
              // 思考过程
              parts.push({
                thought: true,
                text: msg.content || '思考中...',
              });
            } else if (msg.role === 'user') {
              parts.push({
                text: msg.content,
              });
              // 添加图片
              if (msg.images && msg.images.length > 0) {
                msg.images.forEach((img) => {
                  parts.push({
                    inline: img.base64,
                    mimeType: img.mimeType,
                  });
                });
              }
            } else {
              // assistant
              parts.push({
                text: msg.content,
              });
            }

            return {
              id: msg.id,
              role: msg.role as 'user' | 'assistant' | 'system',
              parts,
              createdAt: new Date(msg.created_at),
            };
          });

          set({
            currentConversationId: id,
            messages,
          });
        } catch (error) {
          console.error('Failed to load conversation:', error);
        }
      },

      loadConversationList: async () => {
        try {
          const list = await getConversations();
          set({ conversationList: list });
        } catch (error) {
          console.error('Failed to load conversation list:', error);
        }
      },

      syncCurrentMessage: async (message) => {
        const conversationId = get().currentConversationId;
        if (!conversationId) {
          // 没有对话ID，创建新对话
          try {
            const conv = await createConversation(undefined, get().settings.modelName);
            set({ currentConversationId: conv.id });
            await get().loadConversationList();
          } catch (error) {
            console.error('Failed to create conversation:', error);
            return;
          }
        }

        // 同步消息到服务器
        set({ isSyncing: true });
        try {
          const role = message.role || 'user';
          const content = message.parts
            .filter((p) => !p.inline && !p.thought)
            .map((p) => p.text || '')
            .join('\n');

          // 提取图片
          const images: MessageImage[] = [];
          message.parts.forEach((p) => {
            if (p.inline && p.mimeType) {
              images.push({
                base64: p.inline,
                mimeType: p.mimeType,
              });
            }
          });

          // 检查是否有思考过程
          const thoughtPart = message.parts.find((p) => p.thought);
          const isThought = !!thoughtPart;

          await addMessageApi(
            get().currentConversationId!,
            role,
            content,
            images.length > 0 ? images : undefined,
            isThought,
            message.thinkingDuration
          );

          await get().loadConversationList();
        } catch (error) {
          console.error('Failed to sync message:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      updateConversationTitle: async (id, title) => {
        try {
          await updateConversationTitle(id, title);
          await get().loadConversationList();
        } catch (error) {
          console.error('Failed to update conversation title:', error);
        }
      },

      deleteConversation: async (id) => {
        try {
          await deleteConversationApi(id);

          // 如果删除的是当前对话，清空消息
          if (get().currentConversationId === id) {
            set({ currentConversationId: null, messages: [] });
          }

          await get().loadConversationList();
        } catch (error) {
          console.error('Failed to delete conversation:', error);
        }
      },
    }),
    {
      name: 'gemini-pro-storage',
      storage: createJSONStorage(() => storage),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<AppState>) || {};
        return {
          ...currentState,
          ...persisted,
          settings: {
            ...currentState.settings,
            ...persisted.settings,
          },
        };
      },
      partialize: (state) => ({
        apiKey: state.apiKey,
        settings: state.settings,
        imageHistory: state.imageHistory, // 持久化图片历史记录
        endpointHistory: state.endpointHistory, // 持久化 API 接口地址历史记录
      }),
    }
  )
);
