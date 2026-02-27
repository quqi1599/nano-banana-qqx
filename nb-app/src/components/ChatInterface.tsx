import React, { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import { useAuthStore } from '../store/useAuthStore';
import { InputArea } from './InputArea';
import { PipelineModal } from './PipelineModal';
import { ErrorBoundary } from './ErrorBoundary';
import { streamGeminiResponse, generateContent } from '../services/geminiService';
import { streamContentViaProxy, generateContentViaProxy } from '../services/proxyService';
import { formatCost } from '../services/balanceService';
import { convertMessagesToHistory, convertMessagesToHistoryAsync } from '../utils/messageUtils';
import { ChatMessage, Attachment, Part, AppSettings } from '../types';
import { lazyWithRetry } from '../utils/lazyLoadUtils';
import { calculateHistoryImageSize, checkConversationLimit } from '../utils/historyUtils';
import { Pagination } from './Pagination';
import { getCsrfToken } from '../utils/csrf';
import { fileToBase64 } from '../utils/imageUtils';
import { resolveMessageImageData } from '../utils/messageImageUtils';
import { evaluateMemoryPressure, shouldShowMemoryAlert, formatMemoryAlertMessage, formatMemoryAlertTitle, getMemoryPressureProgress, formatMemoryPressureLabel } from '../utils/memoryGuard';
import { BANANA_PRO_MODEL_NAME, normalizeImageModelName } from '../constants/modelProfiles';
import { isBanana31AccessDeniedError } from '../utils/modelPermission';

// Lazy load components
const ThinkingIndicator = lazyWithRetry(() => import('./ThinkingIndicator').then(m => ({ default: m.ThinkingIndicator })));
const MessageBubble = lazyWithRetry(() => import('./MessageBubble').then(m => ({ default: m.MessageBubble })));

const BALANCE_REFRESH_MIN_INTERVAL_MS = 5000; // 降低到 5 秒
const MAX_RENDER_MESSAGES = 60;

export const ChatInterface: React.FC = () => {
  const {
    apiKey,
    visitorId,
    messages,
    settings,
    currentConversationId,
    messagesPage,
    messagesPageSize,
    messagesTotal,
    addMessage,
    updateLastMessage,
    addImageToHistory,
    isLoading,
    setLoading,
    deleteMessage,
    sliceMessages,
    fetchBalance,
    incrementUsageCount,
    usageCount,
    syncCurrentMessage,
    offloadMessageImages,
    clearHistory,
    updateSettings,
    loadConversation,
    isConversationLoading,
  } = useAppStore();

  const { isAuthenticated, refreshCredits } = useAuthStore();

  const { batchMode, batchCount, setBatchMode, addToast, setShowApiKeyModal, showDialog } = useUiStore();

  const [showArcade, setShowArcade] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pipelineAbortControllerRef = useRef<AbortController | null>(null);
  const balanceRefreshStateRef = useRef({ lastRefreshAt: 0, inFlight: false });
  const isGenerating = isLoading || isPipelineRunning;
  const hasCookieAuth = !!getCsrfToken();
  // 任何有身份标识的用户都能同步历史：登录用户、API Key用户、游客（visitorId）
  const canSyncHistory = isAuthenticated || hasCookieAuth || !!apiKey?.trim() || !!visitorId;

  const buildHistorySnapshot = (sourceMessages: ChatMessage[]) => {
    return convertMessagesToHistory(sourceMessages);
  };

  const buildHistoryForApi = async (sourceMessages: ChatMessage[]) => {
    if (!settings.sendHistory) {
      return [];
    }
    return convertMessagesToHistoryAsync(sourceMessages);
  };

  const createFallbackSettings = (error: unknown, sourceSettings: AppSettings): AppSettings | null => {
    const normalizedModelName = normalizeImageModelName(sourceSettings.modelName);
    if (!isBanana31AccessDeniedError(error, normalizedModelName)) {
      return null;
    }
    if (normalizedModelName === BANANA_PRO_MODEL_NAME) {
      return null;
    }
    return { ...sourceSettings, modelName: BANANA_PRO_MODEL_NAME };
  };

  const generateOnce = async (
    history: any[],
    prompt: string,
    imagesPayload: { base64Data: string; mimeType: string }[],
    requestSettings: AppSettings,
    signal?: AbortSignal
  ) => {
    const useProxy = isAuthenticated || hasCookieAuth;
    const apiKeyValue = apiKey || '';
    return useProxy
      ? generateContentViaProxy(
        history,
        prompt,
        imagesPayload,
        requestSettings,
        signal
      )
      : generateContent(
        apiKeyValue,
        history,
        prompt,
        imagesPayload,
        requestSettings,
        signal
      );
  };

  const generateWithAutoFallback = async (
    history: any[],
    prompt: string,
    imagesPayload: { base64Data: string; mimeType: string }[],
    requestSettings: AppSettings,
    signal?: AbortSignal,
    contextLabel?: string
  ): Promise<{ result: any; effectiveSettings: AppSettings }> => {
    try {
      const result = await generateOnce(history, prompt, imagesPayload, requestSettings, signal);
      return { result, effectiveSettings: requestSettings };
    } catch (error) {
      const fallbackSettings = createFallbackSettings(error, requestSettings);
      if (!fallbackSettings) {
        throw error;
      }

      const fallbackHint = contextLabel
        ? `${contextLabel}当前令牌无 Banana 2（3.1模型）权限，已自动切换到 Banana Pro (3.0模型) 重试。`
        : '当前令牌无 Banana 2（3.1模型）权限，已自动切换到 Banana Pro (3.0模型) 重试。';
      addToast(fallbackHint, 'info');
      updateSettings({ modelName: BANANA_PRO_MODEL_NAME });

      const result = await generateOnce(history, prompt, imagesPayload, fallbackSettings, signal);
      return { result, effectiveSettings: fallbackSettings };
    }
  };

  const showMemoryAlert = React.useCallback((pendingUploadBytes: number = 0) => {
    const currentMessages = useAppStore.getState().messages;
    const historySnapshot = convertMessagesToHistory(currentMessages);
    const imageBytes = calculateHistoryImageSize(historySnapshot) + pendingUploadBytes;
    const result = evaluateMemoryPressure({
      messageCount: currentMessages.length,
      imageBytes,
    });

    if (result.level === 'none') return;
    if (!shouldShowMemoryAlert(result)) return;
    if (useUiStore.getState().dialog) return;

    if (result.level === 'critical') {
      const progress = getMemoryPressureProgress(result);
      showDialog({
        type: 'confirm',
        title: formatMemoryAlertTitle(result.level),
        message: formatMemoryAlertMessage(result, pendingUploadBytes),
        confirmLabel: '新对话',
        cancelLabel: '继续',
        progress,
        progressLabel: formatMemoryPressureLabel(progress, result),
        onConfirm: () => clearHistory(),
      });
    } else {
      const progress = getMemoryPressureProgress(result);
      showDialog({
        type: 'alert',
        title: formatMemoryAlertTitle(result.level),
        message: formatMemoryAlertMessage(result, pendingUploadBytes),
        confirmLabel: '知道了',
        progress,
        progressLabel: formatMemoryPressureLabel(progress, result),
      });
    }
  }, [clearHistory, showDialog]);

  const ensureAttachmentBase64 = async (items: Attachment[]): Promise<Attachment[]> => {
    return Promise.all(
      items.map(async (att) => {
        if (att.base64Data) return att;
        const base64 = await fileToBase64(att.file);
        return {
          ...att,
          base64Data: base64.split(',')[1],
        };
      })
    );
  };

  const refreshBalanceThrottled = async () => {
    if (!apiKey) return false;
    const now = Date.now();
    const state = balanceRefreshStateRef.current;
    if (state.inFlight || now - state.lastRefreshAt < BALANCE_REFRESH_MIN_INTERVAL_MS) {
      return false;
    }

    state.inFlight = true;
    try {
      await fetchBalance();
      return true;
    } finally {
      state.lastRefreshAt = Date.now();
      state.inFlight = false;
    }
  };

  useEffect(() => {
    if (isLoading) {
      setShowArcade(true);
      setIsExiting(false);
    } else if (!isLoading && showArcade) {
      // 当生成完成时，延迟 2.5 秒自动关闭小游戏
      const timer = setTimeout(() => {
        handleCloseArcade();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, showArcade]);

  const handleCloseArcade = () => {
    setIsExiting(true);
    setTimeout(() => {
      setShowArcade(false);
      setIsExiting(false);
    }, 200); // Match animation duration
  };

  const handleToggleArcade = () => {
    if (showArcade && !isExiting) {
      handleCloseArcade();
    } else if (!showArcade) {
      setShowArcade(true);
    }
  };

  const handleMessagesPageChange = async (nextPage: number) => {
    if (!currentConversationId) return;
    await loadConversation(currentConversationId, nextPage);
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const handleScroll = () => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      isAtBottomRef.current = distanceFromBottom < 120;
    };

    handleScroll();
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (currentConversationId) {
      isAtBottomRef.current = true;
    }
  }, [currentConversationId]);

  // Scroll to bottom when messages change or loading state changes
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (!isAtBottomRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, isLoading, showArcade]); // Optimized dependencies (removed full messages content check)

  useEffect(() => {
    showMemoryAlert();
  }, [messages.length, showMemoryAlert]);

  const handleSend = async (text: string, attachments: Attachment[]) => {
    // 检查 API Key：游客（有 visitorId）也可以使用
    if (!isAuthenticated && !hasCookieAuth && !apiKey && !visitorId) {
      setShowApiKeyModal(true);
      addToast('请先登录或输入 API Key', 'error');
      return;
    }

    if (isPipelineRunning) {
      addToast('编排进行中，请先停止或等待完成', 'info');
      return;
    }

    // 检查对话限制：消息数 >= 20 且 图片总大小 >= 120MB
    const currentMessages = useAppStore.getState().messages;
    const historySnapshot = buildHistorySnapshot(currentMessages);
    const limitCheck = checkConversationLimit(historySnapshot);
    if (limitCheck.needNewConversation) {
      clearHistory();
      addToast('对话过长，已自动开启新对话，历史仍可在对话列表查看。', 'info');
    }

    // 批量生成处理
    if (batchMode === 'normal') {
      const tasks: Array<{ text: string; attachments: Attachment[] }> = [];

      // 普通批量：重复 N 次
      for (let i = 0; i < batchCount; i++) {
        tasks.push({ text, attachments });
      }

      // 执行批量任务
      setBatchProgress({ current: 0, total: tasks.length });
      addToast(`开始批量生成 ${tasks.length} 张图片`, 'info');

      for (let i = 0; i < tasks.length; i++) {
        setBatchProgress({ current: i + 1, total: tasks.length });
        try {
          await executeSingleGeneration(tasks[i].text, tasks[i].attachments);
          // 每个任务之间稍作延迟，避免请求过快
          if (i < tasks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`批量任务 ${i + 1} 失败:`, error);
          // 继续执行下一个任务
        }
      }

      setBatchProgress({ current: 0, total: 0 });
      setBatchMode('off'); // 完成后自动关闭批量模式
      addToast(`批量生成完成！共生成 ${tasks.length} 张图片`, 'success');
      return;
    }

    // 单次生成
    await executeSingleGeneration(text, attachments);
  };

  const executeSingleGeneration = async (text: string, attachments: Attachment[], overrideSettings?: Partial<typeof settings>) => {
    const useProxy = isAuthenticated || hasCookieAuth;
    const apiKeyValue = apiKey || '';
    // Capture the current messages state *before* adding the new user message.
    // This allows us to generate history up to this point.
    const currentMessages = useAppStore.getState().messages;
    const history = await buildHistoryForApi(currentMessages);
    // Use override settings if provided, otherwise use global settings
    const effectiveSettings = overrideSettings ? { ...settings, ...overrideSettings } : settings;

    setLoading(true);
    const msgId = Date.now().toString();

    // 记录生成前的余额用于计算消耗
    const balanceBefore = useProxy ? undefined : useAppStore.getState().balance?.usage;

    let resolvedAttachments: Attachment[];
    try {
      resolvedAttachments = await ensureAttachmentBase64(attachments);
    } catch (error) {
      console.error('Failed to read attachments', error);
      addToast('图片读取失败，请重试', 'error');
      setLoading(false);
      return;
    }

    // Construct User UI Message
    const userParts: Part[] = [];
    resolvedAttachments.forEach(att => {
      userParts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.base64Data || ''
        }
      });
    });
    if (text) userParts.push({ text });

    const userMessage: ChatMessage = {
      id: msgId,
      role: 'user',
      parts: userParts,
      timestamp: Date.now()
    };

    // Add User Message
    addMessage(userMessage);

    // 同步用户消息到服务器
    if (canSyncHistory) {
      syncCurrentMessage(userMessage)
        .catch(err => {
          console.error('Sync failed:', err);
          addToast('消息同步失败，但不影响使用', 'info');
        })
        .finally(() => {
          offloadMessageImages(userMessage.id).catch(console.error);
        });
    } else {
      offloadMessageImages(userMessage.id).catch(console.error);
    }

    // Prepare Model Placeholder
    const modelMessageId = (Date.now() + 1).toString();
    const modelMessage: ChatMessage = {
      id: modelMessageId,
      role: 'model',
      parts: [], // Start empty
      timestamp: Date.now()
    };

    // Add Placeholder Model Message to Store
    addMessage(modelMessage);

    let generationSucceeded = false;
    try {
      // Prepare images for service
      const imagesPayload = resolvedAttachments.map(a => ({
        base64Data: a.base64Data || '',
        mimeType: a.mimeType
      }));

      abortControllerRef.current = new AbortController();
      let finalSettings: AppSettings = effectiveSettings;

      const runStreamAttempt = async (attemptSettings: AppSettings) => {
        const startTime = Date.now();
        let thinkingDuration = 0;
        let isThinking = false;
        const stream = useProxy
          ? streamContentViaProxy(
            history,
            text,
            imagesPayload,
            attemptSettings,
            abortControllerRef.current?.signal
          )
          : streamGeminiResponse(
            apiKeyValue,
            history,
            text,
            imagesPayload,
            attemptSettings,
            abortControllerRef.current?.signal
          );

        for await (const chunk of stream) {
          const lastPart = chunk.modelParts[chunk.modelParts.length - 1];
          if (lastPart && lastPart.thought) {
            isThinking = true;
            thinkingDuration = (Date.now() - startTime) / 1000;
          } else if (isThinking && lastPart && !lastPart.thought) {
            isThinking = false;
          }

          updateLastMessage(chunk.modelParts, false, isThinking ? thinkingDuration : undefined);
        }

        if (isThinking) {
          thinkingDuration = (Date.now() - startTime) / 1000;
          updateLastMessage(useAppStore.getState().messages.slice(-1)[0].parts, false, thinkingDuration);
        }
      };

      if (effectiveSettings.streamResponse) {
        try {
          await runStreamAttempt(effectiveSettings);
        } catch (streamError) {
          const fallbackSettings = createFallbackSettings(streamError, effectiveSettings);
          if (!fallbackSettings) {
            throw streamError;
          }

          addToast('当前令牌无 Banana 2（3.1模型）权限，已自动切换到 Banana Pro (3.0模型) 重试。', 'info');
          updateSettings({ modelName: BANANA_PRO_MODEL_NAME });
          finalSettings = fallbackSettings;
          await runStreamAttempt(fallbackSettings);
        }
      } else {
        const startTime = Date.now();
        const { result, effectiveSettings: resolvedSettings } = await generateWithAutoFallback(
          history,
          text,
          imagesPayload,
          effectiveSettings,
          abortControllerRef.current.signal
        );
        finalSettings = resolvedSettings;

        const totalDuration = (Date.now() - startTime) / 1000;
        const hasThought = result.modelParts.some((p: Part) => p.thought);
        updateLastMessage(result.modelParts, false, hasThought ? totalDuration : undefined);
      }

      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // 收集生成的图片到历史记录
      const finalMessage = useAppStore.getState().messages.slice(-1)[0];
      if (finalMessage && finalMessage.role === 'model') {
        const imageParts = finalMessage.parts.filter(p => p.inlineData && !p.thought);
        imageParts.forEach(part => {
          if (part.inlineData) {
            addImageToHistory({
              id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              mimeType: part.inlineData.mimeType,
              base64Data: part.inlineData.data,
              prompt: text || '图片生成',
              timestamp: Date.now(),
              modelName: finalSettings.modelName,
            });
          }
        });
      }

      generationSucceeded = true;

    } catch (error: any) {
      if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        console.log("用户已停止生成");
        return;
      }
      console.error("生成失败", error);

      let errorText = "生成失败。请检查您的网络和 API Key。";
      if (error.message) {
        errorText = `Error: ${error.message}`;
      }

      // Update the placeholder message with error text and flag
      updateLastMessage([{ text: errorText }], true);

    } finally {
      setLoading(false);
      abortControllerRef.current = null;

      if (generationSucceeded) {
        // 增加使用次数
        incrementUsageCount();
        const currentUsageCount = useAppStore.getState().usageCount;

        if (useProxy) {
          try {
            await refreshCredits();
            const remaining = useAuthStore.getState().user?.credit_balance;
            if (remaining !== undefined && remaining !== null) {
              addToast(`生成完成，剩余 ${remaining} 次`, 'success');
            } else {
              addToast(`生成完成 (第 ${currentUsageCount} 次)`, 'success');
            }
          } catch (e) {
            addToast(`生成完成 (第 ${currentUsageCount} 次)`, 'success');
          }
        } else {
          // 刷新余额并计算本次消耗
          try {
            const didRefresh = await refreshBalanceThrottled();
            if (didRefresh) {
              const balanceAfter = useAppStore.getState().balance?.usage;
              if (balanceBefore !== undefined && balanceAfter !== undefined) {
                const cost = balanceAfter - balanceBefore;
                if (cost > 0) {
                  addToast(`本次消耗: ${formatCost(cost)} (第 ${currentUsageCount} 次)`, 'info');
                } else {
                  // 余额没变化，可能是第三方API，显示次数
                  addToast(`生成完成 (第 ${currentUsageCount} 次)`, 'success');
                }
              } else {
                // 余额不可用，显示次数
                addToast(`生成完成 (第 ${currentUsageCount} 次)`, 'success');
              }
            } else {
              addToast(`生成完成 (第 ${currentUsageCount} 次)`, 'success');
            }
          } catch (e) {
            // 余额查询失败，显示使用次数
            addToast(`生成完成 (第 ${currentUsageCount} 次)`, 'success');
          }
        }
      }

      // 自动同步 AI 回复到服务器
      if (canSyncHistory && generationSucceeded) {
        // 获取最新的消息状态（AI 回复）
        const latestMessages = useAppStore.getState().messages;
        const lastMessage = latestMessages[latestMessages.length - 1];
        if (lastMessage && lastMessage.role === 'model') {
          syncCurrentMessage(lastMessage)
            .catch(console.error)
            .finally(() => {
              offloadMessageImages(lastMessage.id).catch(console.error);
            });
        }
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pipelineAbortControllerRef.current) {
      pipelineAbortControllerRef.current.abort();
    }
  };

  const handleDelete = (id: string) => {
    deleteMessage(id);
  };

  const handleRegenerate = async (id: string) => {
    // Fix: Get fresh state from store to avoid closure trap
    const { isLoading, messages: currentMessages } = useAppStore.getState();

    if (isLoading || isPipelineRunning) return;

    const index = currentMessages.findIndex(m => m.id === id);
    if (index === -1) return;

    const message = currentMessages[index];
    let targetUserMessage: ChatMessage | undefined;
    let sliceIndex = -1;

    if (message.role === 'user') {
      targetUserMessage = message;
      sliceIndex = index - 1;
    } else if (message.role === 'model') {
      // Find preceding user message
      if (index > 0 && currentMessages[index - 1].role === 'user') {
        targetUserMessage = currentMessages[index - 1];
        sliceIndex = index - 2;
      }
    }

    if (!targetUserMessage) return;

    // Extract content
    const textPart = targetUserMessage.parts.find(p => p.text);
    const text = textPart ? textPart.text : '';
    const imageParts = targetUserMessage.parts.filter(p => p.inlineData);
    const attachments: Attachment[] = [];

    for (const part of imageParts) {
      const resolved = await resolveMessageImageData(part);
      if (!resolved?.data) continue;
      attachments.push({
        file: new File([], "placeholder"), // Dummy file object
        preview: `data:${resolved.mimeType};base64,${resolved.data}`,
        base64Data: resolved.data,
        mimeType: resolved.mimeType
      });
    }

    if (imageParts.length > 0 && attachments.length === 0) {
      addToast('图片加载失败，请重试', 'error');
      return;
    }

    // Slice history (delete target and future)
    sliceMessages(sliceIndex);

    // Resend
    handleSend(text || '', attachments);
  };

  // Pipeline 执行逻辑 (支持串行和并行)
  const handleExecutePipeline = async (
    mode: 'serial' | 'parallel' | 'combination',
    steps: Array<{ id: string; prompt: string; modelName?: string; status: string }>,
    initialAttachments: Attachment[]
  ) => {
    // 检查 API Key：游客（有 visitorId）也可以使用
    if (!isAuthenticated && !hasCookieAuth && !apiKey && !visitorId) {
      setShowApiKeyModal(true);
      addToast('请先登录或输入 API Key', 'error');
      return;
    }

    if (isLoading || isPipelineRunning) {
      addToast('当前有任务正在运行，请稍后再试', 'info');
      return;
    }

    let resolvedInitialAttachments: Attachment[];
    try {
      resolvedInitialAttachments = await ensureAttachmentBase64(initialAttachments);
    } catch (error) {
      console.error('Failed to read pipeline attachments', error);
      addToast('图片读取失败，请重试', 'error');
      return;
    }

    const pipelineController = new AbortController();
    pipelineAbortControllerRef.current = pipelineController;
    setIsPipelineRunning(true);

    try {
      if (mode === 'serial') {
        // 串行模式: 依次执行
        await executeSerialPipeline(steps, resolvedInitialAttachments, pipelineController.signal);
      } else if (mode === 'parallel') {
        // 并行模式: 同时执行
        await executeParallelPipeline(steps, resolvedInitialAttachments, pipelineController.signal);
      } else if (mode === 'combination') {
        // 批量组合模式: n×m 生成
        await executeCombinationPipeline(steps, resolvedInitialAttachments, pipelineController.signal);
      }
    } finally {
      pipelineAbortControllerRef.current = null;
      setIsPipelineRunning(false);
      if (isAuthenticated) {
        refreshCredits().catch(() => {
          addToast('次数刷新失败', 'info');
        });
      } else {
        refreshBalanceThrottled().catch(() => {
          // Ignore balance errors here; Settings panel will surface failures.
        });
      }
    }
  };

  // 串行执行
  const executeSerialPipeline = async (
    steps: Array<{ prompt: string; modelName?: string }>,
    initialAttachments: Attachment[],
    signal: AbortSignal
  ) => {
    setBatchProgress({ current: 0, total: steps.length });
    addToast(`开始串行编排，共 ${steps.length} 步`, 'info');

    let currentAttachments = initialAttachments;
    let hasError = false;
    let wasAborted = false;

    for (let i = 0; i < steps.length; i++) {
      if (signal.aborted) {
        wasAborted = true;
        break;
      }

      const step = steps[i];
      setBatchProgress({ current: i + 1, total: steps.length });

      try {
        // 准备步骤特定的设置（不修改全局状态）
        const stepSettings = step.modelName ? { modelName: step.modelName } : undefined;

        // 执行单次生成，传入步骤特定的设置
        await executeSingleGeneration(step.prompt, currentAttachments, stepSettings);

        if (signal.aborted) {
          wasAborted = true;
          break;
        }

        // 等待一小段时间确保消息已添加到store
        await new Promise(resolve => setTimeout(resolve, 100));
        if (signal.aborted) {
          wasAborted = true;
          break;
        }

        // 获取最新生成的模型消息
        const currentMessages = useAppStore.getState().messages;
        const lastModelMessage = currentMessages[currentMessages.length - 1];

        if (lastModelMessage && lastModelMessage.role === 'model') {
          // 提取生成的图片作为下一步的输入
          const generatedImages: Attachment[] = [];
          const imageParts = lastModelMessage.parts.filter(p => p.inlineData && !p.thought);
          for (const part of imageParts) {
            const resolved = await resolveMessageImageData(part);
            if (!resolved?.data) continue;
            generatedImages.push({
              file: new File([], "generated"),
              preview: `data:${resolved.mimeType};base64,${resolved.data}`,
              base64Data: resolved.data,
              mimeType: resolved.mimeType
            });
          }

          if (generatedImages.length > 0) {
            currentAttachments = generatedImages;
          } else {
            addToast(`步骤 ${i + 1} 未生成图片，使用原图继续`, 'info');
          }
        }

        // 每个步骤之间延迟，避免请求过快
        if (i < steps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        if (signal.aborted) {
          wasAborted = true;
          break;
        }
        console.error(`Pipeline 步骤 ${i + 1} 失败:`, error);
        addToast(`步骤 ${i + 1} 失败，终止编排`, 'error');
        hasError = true;
        break;
      }
    }

    setBatchProgress({ current: 0, total: 0 });
    if (wasAborted || signal.aborted) {
      addToast('串行编排已停止', 'info');
    } else if (!hasError) {
      addToast('串行编排完成！', 'success');
    }
  };

  // 并行执行 - 优化版：所有结果显示在一条消息中
  const executeParallelPipeline = async (
    steps: Array<{ prompt: string; modelName?: string }>,
    initialAttachments: Attachment[],
    signal: AbortSignal
  ) => {
    setBatchProgress({ current: 0, total: steps.length });
    addToast(`开始并行编排，共 ${steps.length} 个任务`, 'info');

    // 1. 创建用户消息（显示并行编排信息）
    const userMsgId = Date.now().toString();
    const userParts: Part[] = [];

    // 添加初始图片
    initialAttachments.forEach(att => {
      userParts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.base64Data || ''
        }
      });
    });

    // 添加文本说明
    const promptSummary = steps.map((s, i) => `${i + 1}. ${s.prompt}`).join('\n');
    userParts.push({
      text: `🌳 并行编排 (${steps.length}个任务):\n\n${promptSummary}`
    });

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      parts: userParts,
      timestamp: Date.now()
    };
    addMessage(userMessage);

    // 同步用户消息到服务器
    if (canSyncHistory) {
      syncCurrentMessage(userMessage)
        .catch(console.error)
        .finally(() => {
          offloadMessageImages(userMessage.id).catch(console.error);
        });
    } else {
      offloadMessageImages(userMessage.id).catch(console.error);
    }

    // 2. 创建模型占位消息
    const modelMessageId = (Date.now() + 1).toString();
    const modelMessage: ChatMessage = {
      id: modelMessageId,
      role: 'model',
      parts: [],
      timestamp: Date.now()
    };
    addMessage(modelMessage);

    // 3. 收集所有生成的图片
    const allGeneratedParts: Part[] = [];
    let completed = 0;

    // 为每个步骤创建独立的执行任务
    const tasks = steps.map(async (step, index) => {
      if (signal.aborted) return;

      try {
        // 准备步骤特定的设置（不修改全局状态）
        const stepSettings = step.modelName ? { ...settings, modelName: step.modelName } : settings;

        if (signal.aborted) return;

        // 准备临时历史记录
        const currentMessages = useAppStore.getState().messages;
        const history = await buildHistoryForApi(currentMessages.slice(0, -2)); // 排除刚添加的两条消息

        // 准备图片数据
        const imagesPayload = initialAttachments.map(a => ({
          base64Data: a.base64Data || '',
          mimeType: a.mimeType
        }));

        // 执行生成
        const { result, effectiveSettings: resolvedSettings } = await generateWithAutoFallback(
          history,
          step.prompt,
          imagesPayload,
          stepSettings,
          signal,
          `步骤 ${index + 1}: `
        );

        if (signal.aborted) return;

        // 收集生成的部分，为图片附加 prompt 信息（用于数据集下载）
        const partsWithPrompt = result.modelParts.map(part => {
          if (part.inlineData && !part.thought) {
            return { ...part, prompt: step.prompt };
          }
          return part;
        });
        allGeneratedParts.push(...partsWithPrompt);

        // 更新进度
        completed++;
        setBatchProgress({ current: completed, total: steps.length });

        if (!signal.aborted) {
          // 实时更新模型消息
          updateLastMessage(allGeneratedParts, false, undefined);
        }

        if (!signal.aborted) {
          // 将生成的图片添加到历史记录
          const imageParts = result.modelParts.filter(p => p.inlineData && !p.thought);
          imageParts.forEach(part => {
            if (part.inlineData) {
              addImageToHistory({
                id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                mimeType: part.inlineData.mimeType,
                base64Data: part.inlineData.data,
                prompt: step.prompt,
                timestamp: Date.now(),
                modelName: resolvedSettings.modelName,
              });
            }
          });
        }

        // 延迟避免过快请求
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        if (signal.aborted) return;
        console.error(`并行任务 ${index + 1} 失败:`, error);
        // 添加错误文本
        allGeneratedParts.push({
          text: `❌ 步骤 ${index + 1} 失败: ${error instanceof Error ? error.message : '未知错误'}`
        });
        updateLastMessage(allGeneratedParts, false, undefined);

        completed++;
        setBatchProgress({ current: completed, total: steps.length });
      }
    });

    // 等待所有任务完成
    await Promise.all(tasks);

    setBatchProgress({ current: 0, total: 0 });
    if (signal.aborted) {
      addToast('并行编排已停止', 'info');
    } else {
      addToast(`并行编排完成！共生成 ${allGeneratedParts.filter(p => p.inlineData).length} 张图片`, 'success');

      // 自动同步 AI 回复到服务器
      if (canSyncHistory) {
        const latestMessages = useAppStore.getState().messages;
        const lastMessage = latestMessages[latestMessages.length - 1];
        if (lastMessage && lastMessage.role === 'model') {
          syncCurrentMessage(lastMessage)
            .catch(console.error)
            .finally(() => {
              offloadMessageImages(lastMessage.id).catch(console.error);
            });
        }
      }
    }
  };

  // 批量组合执行: n 图片 × m 提示词
  const executeCombinationPipeline = async (
    steps: Array<{ prompt: string; modelName?: string }>,
    initialAttachments: Attachment[],
    signal: AbortSignal
  ) => {
    const totalTasks = initialAttachments.length * steps.length;
    setBatchProgress({ current: 0, total: totalTasks });
    addToast(`开始批量组合生成，共 ${initialAttachments.length} 图 × ${steps.length} 词 = ${totalTasks} 张`, 'info');

    // 1. 创建用户消息
    const userMsgId = Date.now().toString();
    const userParts: Part[] = [];

    // 添加所有初始图片
    initialAttachments.forEach(att => {
      userParts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.base64Data || ''
        }
      });
    });

    // 添加文本说明
    const promptSummary = steps.map((s, i) => `${i + 1}. ${s.prompt}`).join('\n');
    userParts.push({
      text: `🎨 批量组合生成 (${initialAttachments.length}图 × ${steps.length}词 = ${totalTasks}张):\n\n${promptSummary}`
    });

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      parts: userParts,
      timestamp: Date.now()
    };
    addMessage(userMessage);

    // 同步用户消息到服务器
    if (canSyncHistory) {
      syncCurrentMessage(userMessage)
        .catch(console.error)
        .finally(() => {
          offloadMessageImages(userMessage.id).catch(console.error);
        });
    } else {
      offloadMessageImages(userMessage.id).catch(console.error);
    }

    // 2. 创建模型占位消息
    const modelMessageId = (Date.now() + 1).toString();
    const modelMessage: ChatMessage = {
      id: modelMessageId,
      role: 'model',
      parts: [],
      timestamp: Date.now()
    };
    addMessage(modelMessage);

    // 3. 收集所有生成的图片
    const allGeneratedParts: Part[] = [];
    let completed = 0;

    // 为每个图片×提示词组合创建任务
    const tasks = [];
    outer: for (let imgIndex = 0; imgIndex < initialAttachments.length; imgIndex++) {
      if (signal.aborted) {
        break;
      }
      const attachment = initialAttachments[imgIndex];

      for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
        if (signal.aborted) {
          break outer;
        }
        const step = steps[stepIndex];

        const task = (async () => {
          if (signal.aborted) return;

          try {
            // 准备步骤特定的设置（不修改全局状态）
            const stepSettings = step.modelName ? { ...settings, modelName: step.modelName } : settings;

            if (signal.aborted) return;

            // 准备历史记录
            const currentMessages = useAppStore.getState().messages;
            const history = await buildHistoryForApi(currentMessages.slice(0, -2));

            // 准备单张图片数据
            const imagesPayload = [{
              base64Data: attachment.base64Data || '',
              mimeType: attachment.mimeType
            }];

            // 执行生成
            const { result, effectiveSettings: resolvedSettings } = await generateWithAutoFallback(
              history,
              step.prompt,
              imagesPayload,
              stepSettings,
              signal,
              `图片${imgIndex + 1} × 提示词${stepIndex + 1}: `
            );

            if (signal.aborted) return;

            // 收集生成的部分，附加 prompt 信息
            const partsWithPrompt = result.modelParts.map(part => {
              if (part.inlineData && !part.thought) {
                return { ...part, prompt: step.prompt };
              }
              return part;
            });
            allGeneratedParts.push(...partsWithPrompt);

            // 更新进度
            completed++;
            setBatchProgress({ current: completed, total: totalTasks });

            if (!signal.aborted) {
              // 实时更新模型消息
              updateLastMessage(allGeneratedParts, false, undefined);
            }

            if (!signal.aborted) {
              // 将生成的图片添加到历史记录
              const imageParts = result.modelParts.filter(p => p.inlineData && !p.thought);
              imageParts.forEach(part => {
                if (part.inlineData) {
                  addImageToHistory({
                    id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    mimeType: part.inlineData.mimeType,
                    base64Data: part.inlineData.data,
                    prompt: step.prompt,
                    timestamp: Date.now(),
                    modelName: resolvedSettings.modelName,
                  });
                }
              });
            }

            // 延迟避免过快请求
            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (error) {
            if (signal.aborted) return;
            console.error(`组合任务失败 (图${imgIndex + 1} × 词${stepIndex + 1}):`, error);
            // 添加错误文本
            allGeneratedParts.push({
              text: `❌ 图片${imgIndex + 1} × 提示词${stepIndex + 1} 失败: ${error instanceof Error ? error.message : '未知错误'}`
            });
            updateLastMessage(allGeneratedParts, false, undefined);

            completed++;
            setBatchProgress({ current: completed, total: totalTasks });
          }
        })();

        tasks.push(task);
      }
    }

    // 等待所有任务完成
    await Promise.all(tasks);

    setBatchProgress({ current: 0, total: 0 });
    if (signal.aborted) {
      addToast('批量组合已停止', 'info');
    } else {
      addToast(`批量组合完成！共生成 ${allGeneratedParts.filter(p => p.inlineData).length} 张图片`, 'success');

      // 自动同步 AI 回复到服务器
      if (canSyncHistory) {
        const latestMessages = useAppStore.getState().messages;
        const lastMessage = latestMessages[latestMessages.length - 1];
        if (lastMessage && lastMessage.role === 'model') {
          syncCurrentMessage(lastMessage)
            .catch(console.error)
            .finally(() => {
              offloadMessageImages(lastMessage.id).catch(console.error);
            });
        }
      }
    }
  };

  const { visibleMessages, hasHiddenMessages } = useMemo(() => {
    const sliced = messages.length > MAX_RENDER_MESSAGES
      ? messages.slice(-MAX_RENDER_MESSAGES)
      : messages;
    return {
      visibleMessages: sliced,
      hasHiddenMessages: messages.length > sliced.length,
    };
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-bg transition-colors duration-200 relative">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 xs:px-3 sm:px-4 lg:px-6 py-3 xs:py-4 sm:py-6 space-y-4 xs:space-y-6 sm:space-y-8 overscroll-y-contain scroll-touch scrollbar-elegant"
      >
        {/* Batch Progress Indicator */}
        {batchProgress.total > 0 && (
          <div className="sticky top-0 z-10 mb-3 xs:mb-4 p-2.5 xs:p-4 rounded-lg xs:rounded-xl bg-cream-50 dark:bg-cream-900/20 border border-cream-200 dark:border-cream-800 animate-fade-in-down">
            <div className="flex items-center justify-between mb-1.5 xs:mb-2">
              <span className="text-xs xs:text-sm font-medium text-cream-900 dark:text-cream-100">
                批量生成进度
              </span>
              <span className="text-xs xs:text-sm text-cream-700 dark:text-cream-300 font-numeric">
                {batchProgress.current} / {batchProgress.total}
              </span>
            </div>
            <div className="w-full bg-cream-200 dark:bg-cream-800 rounded-full h-1.5 xs:h-2">
              <div
                className="bg-cream-500 h-1.5 xs:h-2 rounded-full transition-all duration-300"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {isConversationLoading && (
          <div className="sticky top-0 z-10 mb-3 xs:mb-4 flex items-center justify-center gap-2 rounded-lg xs:rounded-xl bg-white/85 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 backdrop-blur">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
            <span>正在加载历史对话...</span>
          </div>
        )}

        {currentConversationId && (
          <Pagination
            page={messagesPage}
            pageSize={messagesPageSize}
            total={messagesTotal}
            onPageChange={handleMessagesPageChange}
            className="mb-1.5 xs:mb-2"
          />
        )}

        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center opacity-60 select-none px-4 animate-fade-in">
            <div className="mb-4 xs:mb-6 rounded-3xl bg-amber-50 dark:bg-amber-900/10 p-6 xs:p-8 shadow-sm ring-1 ring-amber-100 dark:ring-amber-900/20 transition-all duration-300">
              <img src="/logo.png?v=2" alt="DEAI" className="h-16 w-16 xs:h-20 xs:w-20 mb-4 mx-auto object-contain" />
              <h3 className="text-xl xs:text-2xl font-bold text-gray-900 dark:text-white mb-2">DEAI Banana</h3>
              <p className="max-w-xs text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                输入描述，即刻生成。<br />
                基于 Gemini 的 AI 创意工具。
              </p>
            </div>
          </div>
        )}

        {hasHiddenMessages && (
          <div className="text-center text-[10px] xs:text-xs text-gray-400 dark:text-gray-600 italic py-2">
            为提升性能，仅显示最近 {MAX_RENDER_MESSAGES} 条消息。
          </div>
        )}

        {visibleMessages.map((msg, index) => (
          <div key={msg.id}>
            <ErrorBoundary>
              <Suspense fallback={<div className="h-12 w-full animate-pulse bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-4"></div>}>
                <MessageBubble
                  message={msg}
                  isLast={index === visibleMessages.length - 1}
                  isGenerating={isGenerating}
                  onDelete={handleDelete}
                  onRegenerate={handleRegenerate}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        ))}

        {showArcade && (
          <React.Suspense fallback={
            <div className="flex w-full justify-center py-6 fade-in-up">
              <div className="w-full max-w-xl h-64 rounded-xl bg-gray-100 dark:bg-gray-900/50 animate-pulse border border-gray-200 dark:border-gray-800"></div>
            </div>
          }>
            <ThinkingIndicator
              isThinking={isLoading}
              onClose={handleCloseArcade}
              isExiting={isExiting}
            />
          </React.Suspense>
        )}

        {/* Spacer for bottom input area */}
        <div className="h-2 xs:h-4 w-full"></div>
      </div>

      <div className="shrink-0 z-20 bg-white/90 dark:bg-dark-bg/95 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800/50 pb-safe transition-all duration-300">
        <div className="mx-auto max-w-4xl">
          <InputArea
            onSend={handleSend}
            onStop={handleStop}
            disabled={isGenerating}
            onOpenArcade={handleToggleArcade}
            isArcadeOpen={showArcade}
            onOpenPipeline={() => setIsPipelineModalOpen(true)}
          />
        </div>
      </div>

      {/* Pipeline Modal */}
      <PipelineModal
        isOpen={isPipelineModalOpen}
        onClose={() => setIsPipelineModalOpen(false)}
        onExecute={handleExecutePipeline}
      />

    </div>
  );
};
