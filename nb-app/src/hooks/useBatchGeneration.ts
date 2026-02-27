/**
 * 批量生成 Hook
 * 
 * 封装批量生成任务的状态管理和轮询逻辑
 * 使用示例：
 * 
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  submitBatchGeneration,
  cancelBatchTask,
  getBatchTask,
  pollBatchTaskUntilComplete,
  SubmitBatchRequest,
  BatchTask,
  BatchMode,
  convertAttachmentsToApiFormat,
} from '../services/batchGenerationService';
import { useUiStore } from '../store/useUiStore';
import {
  DEFAULT_MODEL_NAME,
  ModelAspectRatio,
  ModelResolution,
  sanitizeImageConfigForModel,
} from '../constants/modelProfiles';

interface SubmitOptions {
  mode: BatchMode;
  prompts: string[];
  modelName?: string;
  aspectRatio?: string;
  resolution?: string;
  useGrounding?: boolean;
  initialImages: Array<{ mimeType: string; base64Data?: string; preview: string; file: File }>;
  onProgress?: (task: BatchTask) => void;
}

interface UseBatchGenerationReturn {
  // 状态
  currentTask: BatchTask | null;
  isSubmitting: boolean;
  isRunning: boolean;
  isCancelling: boolean;
  error: Error | null;
  
  // 操作
  submitBatch: (options: SubmitOptions) => Promise<BatchTask>;
  cancelTask: () => Promise<void>;
  refreshTask: () => Promise<void>;
  reset: () => void;
}

export function useBatchGeneration(): UseBatchGenerationReturn {
  const [currentTask, setCurrentTask] = useState<BatchTask | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const { addToast } = useUiStore();

  // 清理函数
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const isRunning = currentTask?.status === 'running' || currentTask?.status === 'queued';

  /**
   * 提交批量生成任务
   */
  const submitBatch = useCallback(async (options: SubmitOptions): Promise<BatchTask> => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      // 转换图片格式
      const apiImages = convertAttachmentsToApiFormat(options.initialImages);
      
      if (apiImages.length === 0 && options.mode === 'combination') {
        throw new Error('批量组合模式需要至少上传一张图片');
      }

      const {
        normalizedModelName,
        effectiveAspectRatio,
        effectiveResolution,
      } = sanitizeImageConfigForModel({
        modelName: options.modelName || DEFAULT_MODEL_NAME,
        resolution: (options.resolution || '1K') as ModelResolution,
        aspectRatio: (options.aspectRatio || 'Auto') as ModelAspectRatio,
      });

      // 准备请求
      const request: SubmitBatchRequest = {
        mode: options.mode,
        prompts: options.prompts,
        model_name: normalizedModelName,
        aspect_ratio: effectiveAspectRatio,
        resolution: effectiveResolution,
        use_grounding: options.useGrounding,
        initial_images: apiImages,
      };

      // 提交任务
      const task = await submitBatchGeneration(request);
      setCurrentTask(task);
      
      addToast(`批量生成任务已提交（ID: ${task.id.slice(0, 8)}）`, 'success');

      // 创建 AbortController 用于取消轮询
      abortControllerRef.current = new AbortController();
      
      // 开始轮询
      pollBatchTaskUntilComplete(
        task.id,
        (updatedTask) => {
          setCurrentTask(updatedTask);
          if (options.onProgress) {
            options.onProgress(updatedTask);
          }
        },
        2000 // 2秒轮询一次
      ).then(finalTask => {
        setCurrentTask(finalTask);
        
        // 根据最终状态显示提示
        if (finalTask.status === 'completed') {
          addToast('批量生成完成！', 'success');
        } else if (finalTask.status === 'partial') {
          addToast(`批量生成部分完成（${finalTask.progress.completed}/${finalTask.progress.total}）`, 'info');
        } else if (finalTask.status === 'cancelled') {
          addToast('批量生成已取消', 'info');
        } else if (finalTask.status === 'failed') {
          addToast(`批量生成失败：${finalTask.error || '未知错误'}`, 'error');
        }
      }).catch(err => {
        if (err.name !== 'AbortError') {
          setError(err);
          addToast(`轮询失败：${err.message}`, 'error');
        }
      });

      return task;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      addToast(`提交失败：${error.message}`, 'error');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [addToast]);

  /**
   * 取消当前任务
   */
  const cancelTask = useCallback(async (): Promise<void> => {
    if (!currentTask?.id) {
      addToast('没有进行中的任务', 'info');
      return;
    }

    if (!['pending', 'queued', 'running'].includes(currentTask.status)) {
      addToast('当前任务状态无法取消', 'info');
      return;
    }

    setIsCancelling(true);
    
    try {
      // 中止轮询
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // 发送取消请求
      await cancelBatchTask(currentTask.id, '用户取消');
      
      // 刷新任务状态
      const updatedTask = await getBatchTask(currentTask.id);
      setCurrentTask(updatedTask);
      
      addToast('取消请求已发送', 'success');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      addToast(`取消失败：${error.message}`, 'error');
      throw error;
    } finally {
      setIsCancelling(false);
    }
  }, [currentTask, addToast]);

  /**
   * 刷新当前任务状态
   */
  const refreshTask = useCallback(async (): Promise<void> => {
    if (!currentTask?.id) return;
    
    try {
      const task = await getBatchTask(currentTask.id);
      setCurrentTask(task);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      addToast(`刷新失败：${error.message}`, 'error');
    }
  }, [currentTask, addToast]);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setCurrentTask(null);
    setError(null);
    setIsSubmitting(false);
    setIsCancelling(false);
  }, []);

  return {
    currentTask,
    isSubmitting,
    isRunning,
    isCancelling,
    error,
    submitBatch,
    cancelTask,
    refreshTask,
    reset,
  };
}

export default useBatchGeneration;
