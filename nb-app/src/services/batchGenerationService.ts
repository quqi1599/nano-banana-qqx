/**
 * 批量生成服务 - 后端 Celery 队列版
 * 
 * 支持：
 * - 提交批量生成任务到后端队列
 * - 轮询查询任务状态
 * - 取消进行中的任务
 * - 实时进度追踪
 */

import { getBackendUrl } from '../utils/backendUrl';
import { buildRequestOptions } from '../utils/request';

const API_BASE = `${getBackendUrl()}/api`;

// 任务模式
export type BatchMode = 'serial' | 'parallel' | 'combination';

// 任务状态
export type BatchTaskStatus = 
  | 'pending' | 'queued' | 'running' | 'paused' 
  | 'completed' | 'partial' | 'cancelled' | 'failed';

// 提交任务请求
export interface SubmitBatchRequest {
  mode: BatchMode;
  prompts: string[];
  model_name?: string;
  aspect_ratio?: string;
  resolution?: string;
  use_grounding?: boolean;
  initial_images: {
    mime_type: string;
    data: string;
    name?: string;
  }[];
}

// 任务响应
export interface BatchTask {
  id: string;
  mode: BatchMode;
  status: BatchTaskStatus;
  progress: {
    total: number;
    completed: number;
    failed: number;
    percentage: number;
  };
  config: {
    prompts: string[];
    model_name: string;
    aspect_ratio: string;
    resolution: string;
    use_grounding: boolean;
  };
  results: Array<{
    index: number;
    status: 'success' | 'failed' | 'cancelled';
    parts?: any[];
    error?: string;
    completed_at?: string;
  }>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  credits: {
    total: number;
    refunded: number;
  };
  error?: string;
}

// 进度回调
export type ProgressCallback = (task: BatchTask) => void;

/**
 * 提交批量生成任务
 */
export async function submitBatchGeneration(
  request: SubmitBatchRequest
): Promise<BatchTask> {
  const response = await fetch(
    `${API_BASE}/batch-generation/submit`,
    buildRequestOptions({
      method: 'POST',
      body: JSON.stringify(request),
    })
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '提交失败' }));
    throw new Error(error.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}

/**
 * 获取任务详情
 */
export async function getBatchTask(taskId: string): Promise<BatchTask> {
  const response = await fetch(
    `${API_BASE}/batch-generation/tasks/${taskId}`,
    buildRequestOptions({ method: 'GET' })
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '获取任务失败' }));
    throw new Error(error.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}

/**
 * 取消批量任务
 */
export async function cancelBatchTask(
  taskId: string,
  reason: string = '用户取消'
): Promise<{ status: string; message: string }> {
  const response = await fetch(
    `${API_BASE}/batch-generation/tasks/${taskId}/cancel`,
    buildRequestOptions({
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '取消失败' }));
    throw new Error(error.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}

/**
 * 获取任务列表
 */
export async function listBatchTasks(
  options: {
    status?: BatchTaskStatus;
    page?: number;
    page_size?: number;
  } = {}
): Promise<{
  tasks: BatchTask[];
  total: number;
  page: number;
  page_size: number;
}> {
  const params = new URLSearchParams();
  if (options.status) params.append('status', options.status);
  if (options.page) params.append('page', String(options.page));
  if (options.page_size) params.append('page_size', String(options.page_size));

  const response = await fetch(
    `${API_BASE}/batch-generation/tasks?${params}`,
    buildRequestOptions({ method: 'GET' })
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '获取列表失败' }));
    throw new Error(error.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}

/**
 * 删除已完成任务
 */
export async function deleteBatchTask(taskId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/batch-generation/tasks/${taskId}`,
    buildRequestOptions({ method: 'DELETE' })
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '删除失败' }));
    throw new Error(error.detail || `HTTP error ${response.status}`);
  }
}

/**
 * 轮询任务状态直到完成
 * 
 * @param taskId 任务ID
 * @param onProgress 进度回调（每2秒调用一次）
 * @param checkInterval 检查间隔（毫秒，默认2000）
 * @returns 最终任务状态
 */
export async function pollBatchTaskUntilComplete(
  taskId: string,
  onProgress?: ProgressCallback,
  checkInterval: number = 2000
): Promise<BatchTask> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const task = await getBatchTask(taskId);
        
        // 调用进度回调
        if (onProgress) {
          onProgress(task);
        }

        // 检查是否完成
        const isCompleted = [
          'completed', 'partial', 'cancelled', 'failed'
        ].includes(task.status);

        if (isCompleted) {
          resolve(task);
        } else {
          // 继续轮询
          setTimeout(poll, checkInterval);
        }
      } catch (error) {
        reject(error);
      }
    };

    // 开始轮询
    poll();
  });
}

/**
 * 获取用户批量生成统计
 */
export async function getBatchStats(): Promise<{
  total_tasks: number;
  status_counts: Record<BatchTaskStatus, number>;
  total_generated: number;
  credits: {
    total: number;
    refunded: number;
    net: number;
  };
}> {
  const response = await fetch(
    `${API_BASE}/batch-generation/stats`,
    buildRequestOptions({ method: 'GET' })
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '获取统计失败' }));
    throw new Error(error.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}

/**
 * 转换前端 Attachment 为后端格式
 */
export function convertAttachmentsToApiFormat(
  attachments: Array<{ mimeType: string; base64Data?: string; preview: string; file: File }>
): Array<{ mime_type: string; data: string; name: string }> {
  return attachments.map(att => {
    // 如果有 base64Data 直接使用，否则从 preview 提取
    let data = att.base64Data || '';
    if (!data && att.preview.startsWith('data:')) {
      // 从 data URL 提取 base64
      const commaIndex = att.preview.indexOf(',');
      if (commaIndex !== -1) {
        data = att.preview.substring(commaIndex + 1);
      }
    }
    
    return {
      mime_type: att.mimeType,
      data: data,
      name: att.file.name || 'image.png',
    };
  }).filter(img => img.data); // 过滤掉没有数据的
}
