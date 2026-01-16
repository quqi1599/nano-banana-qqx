import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { get as getVal, set as setVal, del as delVal } from 'idb-keyval';
import { fetchBalance, BalanceInfo } from '../services/balanceService';
import {
  createConversation,
  getConversationsPage,
  getConversationMessages,
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
import { useUiStore } from './useUiStore';
import { getCsrfToken } from '../utils/csrf';

// Custom IndexedDB storage
const API_KEY_STORAGE = 'nbnb_api_key';
const VISITOR_ID_STORAGE = 'nbnb_visitor_id';
const CUSTOM_ENDPOINT_STORAGE = 'nbnb_custom_endpoint';
const SYNC_BASE_DELAY_MS = 1000;

const getOrGenerateVisitorId = () => {
  let id = localStorage.getItem(VISITOR_ID_STORAGE);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_STORAGE, id);
  }
  return id;
};

const SYNC_MAX_ATTEMPTS = 5;
let syncQueueTimer: ReturnType<typeof setTimeout> | null = null;
const LOCAL_TITLE_MAX_LENGTH = 50;

const generateLocalTitle = (message: ChatMessage): string | null => {
  if (message.role !== 'user') return null;
  const text = message.parts.find((part) => part.text)?.text || '';
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (cleaned.length > LOCAL_TITLE_MAX_LENGTH) {
    return `${cleaned.slice(0, LOCAL_TITLE_MAX_LENGTH)}...`;
  }
  return cleaned;
};

const shouldPersistLocalHistory = (): boolean => {
  return !getCsrfToken();
};

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

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

interface PendingSyncItem {
  message: ChatMessage;
  attempts: number;
  nextRetryAt: number;
}

export interface LocalConversation extends Conversation {
  messages: ChatMessage[];
  server_id?: string | null;
}

interface AppState {
  apiKey: string | null;
  visitorId: string | null;
  settings: AppSettings;
  messages: ChatMessage[]; // Single Source of Truth
  imageHistory: ImageHistoryItem[]; // 图片历史记录
  endpointHistory: string[]; // API 接口地址历史记录
  isLoading: boolean;
  isSettingsOpen: boolean;
  inputText: string; // Global input text state
  balance: BalanceInfo | null;
  usageCount: number; // 使用次数（当余额API不可用时使用）
  installPrompt: BeforeInstallPromptEvent | null; // PWA Install Prompt Event

  // 对话历史相关
  currentConversationId: string | null;
  conversationList: Conversation[];
  conversationListTotal: number;
  conversationListPage: number;
  conversationListPageSize: number;
  messagesPage: number;
  messagesPageSize: number;
  messagesTotal: number;
  isSyncing: boolean;
  pendingSyncQueue: PendingSyncItem[];
  isSyncQueueRunning: boolean;
  localConversationId: string | null;
  localConversations: LocalConversation[];

  setInstallPrompt: (prompt: BeforeInstallPromptEvent | null) => void;
  setApiKey: (key: string) => void;
  setVisitorId: (id: string) => void;
  fetchBalance: () => Promise<BalanceInfo | undefined>;
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
  loadConversation: (id: string, page?: number) => Promise<void>;
  loadConversationList: (page?: number, pageSize?: number) => Promise<void>;
  syncCurrentMessage: (message: ChatMessage) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentConversationId: (id: string | null) => void;
  processSyncQueue: () => Promise<void>;
  setLocalConversationId: (id: string | null) => void;
  loadLocalConversation: (id: string) => void;
  deleteLocalConversation: (id: string) => void;
  updateLocalConversationTitle: (id: string, title: string) => void;
}


export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      apiKey: null,
      visitorId: getOrGenerateVisitorId(),
      settings: {
        resolution: '1K',
        aspectRatio: 'Auto',
        useGrounding: false,
        enableThinking: false,
        streamResponse: true,
        sendHistory: false,
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
      conversationListTotal: 0,
      conversationListPage: 1,
      conversationListPageSize: 20,
      messagesPage: 1,
      messagesPageSize: 50,
      messagesTotal: 0,
      isSyncing: false,
      pendingSyncQueue: [],
      isSyncQueueRunning: false,
      localConversationId: null,
      localConversations: [],

      setInstallPrompt: (prompt) => set({ installPrompt: prompt }),
      setApiKey: (key) => {
        const trimmed = key.trim();
        if (trimmed) {
          localStorage.setItem(API_KEY_STORAGE, trimmed);
        } else {
          localStorage.removeItem(API_KEY_STORAGE);
        }
        set({ apiKey: trimmed || null });
      },
      setVisitorId: (id) => {
        localStorage.setItem(VISITOR_ID_STORAGE, id);
        set({ visitorId: id });
      },


      fetchBalance: async () => {
        const { apiKey, settings } = get();
        if (!apiKey) return;
        try {
          const balance = await fetchBalance(apiKey, settings);
          set({ balance });
          return balance;
        } catch (error) {
          console.error('Failed to update balance:', error);
          throw error;
        }
      },

      incrementUsageCount: () => set((state) => ({ usageCount: state.usageCount + 1 })),

      resetUsageCount: () => set({ usageCount: 0 }),

      updateSettings: (newSettings) =>
        set((state) => {
          const updatedSettings = { ...state.settings, ...newSettings };
          // 同步 customEndpoint 到 localStorage，供 conversationService 使用
          if (newSettings.customEndpoint !== undefined) {
            if (newSettings.customEndpoint) {
              localStorage.setItem(CUSTOM_ENDPOINT_STORAGE, newSettings.customEndpoint);
            } else {
              localStorage.removeItem(CUSTOM_ENDPOINT_STORAGE);
            }
          }
          return { settings: updatedSettings };
        }),

      addEndpointToHistory: (endpoint) =>
        set((state) => {
          const trimmed = endpoint.trim();
          if (!trimmed) return {};
          // 移除重复项，将新地址放到最前面，最多保留 10 个
          const filtered = state.endpointHistory.filter((e) => e !== trimmed);
          return { endpointHistory: [trimmed, ...filtered].slice(0, 10) };
        }),

      addMessage: (message) =>
        set((state) => {
          const nextMessages = [...state.messages, message];
          if (!shouldPersistLocalHistory()) {
            return { messages: nextMessages };
          }

          const now = new Date().toISOString();
          let localConversationId = state.localConversationId;
          let localConversations = [...state.localConversations];
          let conversationIndex = localConversations.findIndex(
            (conv) => conv.id === localConversationId
          );

          if (!localConversationId || conversationIndex === -1) {
            localConversationId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const newConversation: LocalConversation = {
              id: localConversationId,
              user_id: 'local',
              title: null,
              model_name: state.settings.modelName || null,
              message_count: 0,
              created_at: now,
              updated_at: now,
              messages: [],
              server_id: state.currentConversationId || null,
            };
            localConversations = [newConversation, ...localConversations];
            conversationIndex = 0;
          }

          const existing = localConversations[conversationIndex];
          const nextTitle = existing.title || generateLocalTitle(message);
          const updatedMessages = [...existing.messages, message];
          const updatedConversation: LocalConversation = {
            ...existing,
            title: nextTitle,
            model_name: existing.model_name || state.settings.modelName || null,
            messages: updatedMessages,
            message_count: updatedMessages.length,
            updated_at: now,
            server_id: existing.server_id || state.currentConversationId || null,
          };

          localConversations.splice(conversationIndex, 1);
          localConversations.unshift(updatedConversation);

          return {
            messages: nextMessages,
            localConversationId,
            localConversations,
          };
        }),

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

          if (!shouldPersistLocalHistory()) {
            return { messages };
          }

          const localConversationId = state.localConversationId;
          if (!localConversationId) {
            return { messages };
          }

          const conversationIndex = state.localConversations.findIndex(
            (conv) => conv.id === localConversationId
          );
          if (conversationIndex === -1) {
            return { messages };
          }

          const now = new Date().toISOString();
          const localConversations = [...state.localConversations];
          const conversation = localConversations[conversationIndex];
          const updatedLocalMessages = [...conversation.messages];
          if (updatedLocalMessages.length > 0) {
            updatedLocalMessages[updatedLocalMessages.length - 1] = {
              ...updatedLocalMessages[updatedLocalMessages.length - 1],
              parts: [...parts],
              isError,
              ...(thinkingDuration !== undefined && { thinkingDuration }),
            };
          }

          const updatedConversation: LocalConversation = {
            ...conversation,
            messages: updatedLocalMessages,
            message_count: updatedLocalMessages.length,
            updated_at: now,
          };

          localConversations.splice(conversationIndex, 1);
          localConversations.unshift(updatedConversation);

          return { messages, localConversations };
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

      clearHistory: () =>
        set({
          currentConversationId: null,
          localConversationId: null,
          messages: [],
          messagesTotal: 0,
          messagesPage: 1,
        }),

      removeApiKey: () => {
        localStorage.removeItem(API_KEY_STORAGE);
        set({ apiKey: null });
      },

      deleteMessage: (id) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === id);
          if (index === -1) return {};

          const newMessages = [...state.messages];
          newMessages.splice(index, 1);

          if (!shouldPersistLocalHistory()) {
            return { messages: newMessages };
          }

          const localConversationId = state.localConversationId;
          if (!localConversationId) {
            return { messages: newMessages };
          }

          const conversationIndex = state.localConversations.findIndex(
            (conv) => conv.id === localConversationId
          );
          if (conversationIndex === -1) {
            return { messages: newMessages };
          }

          const localConversations = [...state.localConversations];
          const conversation = localConversations[conversationIndex];
          const updatedLocalMessages = conversation.messages.filter((m) => m.id !== id);
          const updatedConversation: LocalConversation = {
            ...conversation,
            messages: updatedLocalMessages,
            message_count: updatedLocalMessages.length,
            updated_at: new Date().toISOString(),
          };

          localConversations.splice(conversationIndex, 1);
          localConversations.unshift(updatedConversation);

          return { messages: newMessages, localConversations };
        }),

      sliceMessages: (index) =>
        set((state) => {
          const slicedMessages = state.messages.slice(0, index + 1);
          if (!shouldPersistLocalHistory()) {
            return { messages: slicedMessages };
          }

          const localConversationId = state.localConversationId;
          if (!localConversationId) {
            return { messages: slicedMessages };
          }

          const conversationIndex = state.localConversations.findIndex(
            (conv) => conv.id === localConversationId
          );
          if (conversationIndex === -1) {
            return { messages: slicedMessages };
          }

          const localConversations = [...state.localConversations];
          const conversation = localConversations[conversationIndex];
          const updatedConversation: LocalConversation = {
            ...conversation,
            messages: slicedMessages,
            message_count: slicedMessages.length,
            updated_at: new Date().toISOString(),
          };

          localConversations.splice(conversationIndex, 1);
          localConversations.unshift(updatedConversation);

          return { messages: slicedMessages, localConversations };
        }),

      // ============ 对话历史方法 ============

      setCurrentConversationId: (id) => set({ currentConversationId: id }),
      setLocalConversationId: (id) => set({ localConversationId: id }),

      createNewConversation: async (title) => {
        try {
          // 清空当前对话ID，这样下一条消息会创建新对话
          set({
            currentConversationId: null,
            localConversationId: null,
            messages: [],
            messagesTotal: 0,
            messagesPage: 1,
          });
          console.log('[Conversation] 已清空，等待下条消息创建新对话');
          return null;
        } catch (error) {
          console.error('Failed to prepare new conversation:', error);
          return null;
        }
      },

      loadConversation: async (id, page) => {
        try {
          console.log('[Conversation] 加载对话:', id);
          const pageSize = get().messagesPageSize;
          let targetPage = page ?? 1;
          let data = await getConversationMessages(id, targetPage, pageSize);
          const total = Number.isFinite(data.total) ? data.total : data.messages.length;
          const resolvedPageSize = data.page_size || pageSize;
          const totalPages = Math.max(1, Math.ceil(total / resolvedPageSize));

          if (page === undefined) {
            targetPage = totalPages;
            if (targetPage !== data.page) {
              data = await getConversationMessages(id, targetPage, resolvedPageSize);
            }
          }

          // 转换消息格式
          const messages: ChatMessage[] = [];
          for (const msg of data.messages) {
            const parts: Part[] = [];

            if (msg.is_thought) {
              // 思考过程
              parts.push({
                thought: true,
                text: msg.content || '思考中...',
              });
            } else if (msg.role === 'user') {
              // 用户消息：先文字后图片
              if (msg.content) {
                parts.push({ text: msg.content });
              }
              // 添加图片
              if (msg.images && msg.images.length > 0) {
                msg.images.forEach((img) => {
                  parts.push({
                    inlineData: {
                      data: img.base64,
                      mimeType: img.mimeType,
                    },
                  });
                });
              }
            } else {
              // assistant 消息
              parts.push({
                text: msg.content,
              });
              // 添加图片（如果有）
              if (msg.images && msg.images.length > 0) {
                msg.images.forEach((img) => {
                  parts.push({
                    inlineData: {
                      data: img.base64,
                      mimeType: img.mimeType,
                    },
                  });
                });
              }
            }

            const normalizedRole =
              msg.role === 'assistant' || msg.role === 'system' ? 'model' : msg.role;

            messages.push({
              id: msg.id,
              role: normalizedRole as 'user' | 'model',
              parts,
              timestamp: new Date(msg.created_at).getTime(),
              ...(msg.thinking_duration != null && { thinkingDuration: msg.thinking_duration }),
            });
          }

          set({
            currentConversationId: id,
            messages,
            messagesTotal: total,
            messagesPage: targetPage,
            messagesPageSize: resolvedPageSize,
          });

          if (shouldPersistLocalHistory()) {
            set((state) => {
              const localConversationId = state.localConversationId;
              if (!localConversationId) return {};
              const conversationIndex = state.localConversations.findIndex(
                (conv) => conv.id === localConversationId && conv.server_id === id
              );
              if (conversationIndex === -1) return {};
              const localConversations = [...state.localConversations];
              const conversation = localConversations[conversationIndex];
              const updatedConversation: LocalConversation = {
                ...conversation,
                messages,
                message_count: messages.length,
                updated_at: new Date().toISOString(),
              };
              localConversations.splice(conversationIndex, 1);
              localConversations.unshift(updatedConversation);
              return { localConversations };
            });
          }

          console.log(`[Conversation] 已加载 ${messages.length} 条消息`);
        } catch (error) {
          console.error('Failed to load conversation:', error);
        }
      },

      loadLocalConversation: (id) => {
        const state = get();
        const conversation = state.localConversations.find((conv) => conv.id === id);
        if (!conversation) {
          return;
        }

        set({
          localConversationId: id,
          currentConversationId: conversation.server_id || null,
          messages: conversation.messages,
          messagesTotal: conversation.messages.length,
          messagesPage: 1,
        });
      },

      loadConversationList: async (page, pageSize) => {
        try {
          const resolvedPage = page ?? get().conversationListPage;
          const resolvedPageSize = pageSize ?? get().conversationListPageSize;
          const { conversations, total } = await getConversationsPage(resolvedPage, resolvedPageSize);
          const totalCount = total ?? conversations.length;
          const totalPages = Math.max(1, Math.ceil(totalCount / resolvedPageSize));
          const nextPage = resolvedPage > totalPages ? totalPages : resolvedPage;

          if (nextPage !== resolvedPage) {
            const retry = await getConversationsPage(nextPage, resolvedPageSize);
            set({
              conversationList: retry.conversations,
              conversationListTotal: retry.total ?? retry.conversations.length,
              conversationListPage: nextPage,
              conversationListPageSize: resolvedPageSize,
            });
            return;
          }

          set({
            conversationList: conversations,
            conversationListTotal: totalCount,
            conversationListPage: resolvedPage,
            conversationListPageSize: resolvedPageSize,
          });
        } catch (error) {
          console.error('Failed to load conversation list:', error);
        }
      },

      deleteLocalConversation: (id) => {
        set((state) => {
          const localConversations = state.localConversations.filter((conv) => conv.id !== id);
          const shouldReset = state.localConversationId === id;
          return {
            localConversations,
            ...(shouldReset ? { localConversationId: null, currentConversationId: null, messages: [] } : {}),
          };
        });
      },

      updateLocalConversationTitle: (id, title) => {
        set((state) => ({
          localConversations: state.localConversations.map((conv) =>
            conv.id === id ? { ...conv, title, updated_at: new Date().toISOString() } : conv
          ),
        }));
      },

      processSyncQueue: async () => {
        // Allow anonymous sync if visitorId is present
        const apiKey = get().apiKey?.trim();
        const hasCookieAuth = !!getCsrfToken();
        const visitorId = get().visitorId;

        if (!hasCookieAuth && !apiKey && !visitorId) {
          console.log('[Conversation] 未认证且无游客标识，跳过同步');
          set({ isSyncQueueRunning: false, isSyncing: false, pendingSyncQueue: [] });
          return;
        }

        if (get().isSyncQueueRunning) return;
        set({ isSyncQueueRunning: true, isSyncing: true });

        try {
          while (true) {
            const queue = get().pendingSyncQueue;
            if (queue.length === 0) {
              break;
            }

            const now = Date.now();
            const [item, ...rest] = queue;
            if (item.nextRetryAt > now) {
              const delay = item.nextRetryAt - now;
              if (syncQueueTimer) {
                clearTimeout(syncQueueTimer);
              }
              syncQueueTimer = setTimeout(() => {
                get().processSyncQueue().catch(console.error);
              }, delay);
              break;
            }

            try {
              let conversationId = get().currentConversationId;
              let isNewConversation = false;

              if (!conversationId) {
                const conv = await createConversation(
                  undefined,
                  get().settings.modelName,
                  get().settings.customEndpoint
                );
                conversationId = conv.id;
                set({ currentConversationId: conversationId });
                isNewConversation = true;
                console.log('[Conversation] 创建新对话:', conversationId);

                const localConversationId = get().localConversationId;
                if (localConversationId) {
                  set((state) => ({
                    localConversations: state.localConversations.map((convItem) =>
                      convItem.id === localConversationId && !convItem.server_id
                        ? { ...convItem, server_id: conversationId }
                        : convItem
                    ),
                  }));
                }
              }

              const role = item.message.role || 'user';
              const contentParts = item.message.parts
                .filter((p) => !p.inlineData && !p.thought)
                .map((p) => p.text || '');
              let content = contentParts.join('\n');

              const images: MessageImage[] = [];
              item.message.parts.forEach((p) => {
                if (p.inlineData?.data && p.inlineData.mimeType) {
                  images.push({
                    base64: p.inlineData.data,
                    mimeType: p.inlineData.mimeType,
                  });
                }
              });

              const hasThought = item.message.parts.some((p) => p.thought);
              const hasNonThoughtContent = item.message.parts.some(
                (p) => !p.thought && (p.text || p.inlineData)
              );
              const isThought = hasThought && !hasNonThoughtContent;
              if (!content && isThought) {
                content = item.message.parts
                  .filter((p) => p.thought && p.text)
                  .map((p) => p.text || '')
                  .join('\n');
              }

              await addMessageApi(
                conversationId,
                role,
                content,
                images.length > 0 ? images : undefined,
                isThought,
                item.message.thinkingDuration
              );

              if (isNewConversation) {
                await get().loadConversationList();
              }

              set((state) => {
                if (state.currentConversationId !== conversationId) return {};
                const nextTotal = Math.max(state.messagesTotal + 1, state.messages.length);
                return { messagesTotal: nextTotal };
              });

              set({ pendingSyncQueue: rest });
              console.log(`[Conversation] 同步消息: ${role}, 对话: ${conversationId}`);
            } catch (error) {
              const attempts = item.attempts + 1;
              if (attempts >= SYNC_MAX_ATTEMPTS) {
                set({ pendingSyncQueue: rest });
                useUiStore
                  .getState()
                  .addToast('消息同步失败，请检查网络后重试', 'error');
                console.error('Sync message failed after retries:', error);
              } else {
                const backoff = SYNC_BASE_DELAY_MS * Math.pow(2, attempts - 1);
                const jitter = Math.floor(Math.random() * 300);
                const nextRetryAt = Date.now() + backoff + jitter;
                set({
                  pendingSyncQueue: [
                    ...rest,
                    { ...item, attempts, nextRetryAt },
                  ],
                });
              }
            }
          }
        } finally {
          set({ isSyncQueueRunning: false, isSyncing: false });
        }
      },

      syncCurrentMessage: async (message) => {
        const apiKey = get().apiKey?.trim();
        const hasCookieAuth = !!getCsrfToken();
        const visitorId = get().visitorId;

        if (!hasCookieAuth && !apiKey && !visitorId) return;

        set((state) => {
          if (state.pendingSyncQueue.some((item) => item.message.id === message.id)) {
            return {};
          }
          return {
            pendingSyncQueue: [
              ...state.pendingSyncQueue,
              { message, attempts: 0, nextRetryAt: Date.now() },
            ],
          };
        });

        await get().processSyncQueue();
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
            set({ currentConversationId: null, messages: [], messagesTotal: 0, messagesPage: 1 });
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
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // 同步 API Key 到 localStorage
        if (state.apiKey) {
          localStorage.setItem(API_KEY_STORAGE, state.apiKey);
        } else {
          localStorage.removeItem(API_KEY_STORAGE);
        }

        // 对于本地对话（未登录用户），恢复最后活动的对话
        const hasLocalConversations = state.localConversations && state.localConversations.length > 0;

        if (hasLocalConversations) {
          // 有本地对话，恢复最后活动的对话
          if (state.localConversationId) {
            const activeConversation = state.localConversations.find(
              (conv) => conv.id === state.localConversationId
            );
            if (activeConversation) {
              state.localConversationId = activeConversation.id;
              state.messages = activeConversation.messages || [];
              // 不清空 currentConversationId，如果已同步到服务器则保留
              return;
            }
          }
          // 如果没有活动的本地对话，使用最新的一个
          const latestConversation = state.localConversations[0];
          if (latestConversation) {
            state.localConversationId = latestConversation.id;
            state.messages = latestConversation.messages || [];
            state.currentConversationId = latestConversation.server_id || null;
          }
        } else {
          // 没有本地对话，清空状态
          state.localConversationId = null;
          state.currentConversationId = null;
          state.messages = [];
        }
      },
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
        visitorId: state.visitorId,
        settings: state.settings,
        imageHistory: state.imageHistory, // 持久化图片历史记录
        endpointHistory: state.endpointHistory, // 持久化 API 接口地址历史记录
        usageCount: state.usageCount, // 持久化本地使用次数
        localConversationId: state.localConversationId,
        localConversations: state.localConversations,
        // 对话历史持久化到本地缓存，支持未登录用户查看历史
        currentConversationId: state.currentConversationId,
        conversationList: state.conversationList,
        conversationListTotal: state.conversationListTotal,
        conversationListPage: state.conversationListPage,
        conversationListPageSize: state.conversationListPageSize,
        messagesPage: state.messagesPage,
        messagesPageSize: state.messagesPageSize,
        messagesTotal: state.messagesTotal,
      }),
    }
  )
);
