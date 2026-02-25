/**
 * 批量任务进度显示组件
 * 
 * 显示批量生成任务的实时进度和状态
 */

import React from 'react';
import { Loader2, CheckCircle2, XCircle, AlertCircle, PauseCircle } from 'lucide-react';
import { BatchTask, BatchTaskStatus } from '../services/batchGenerationService';

interface BatchTaskProgressProps {
  task: BatchTask | null;
  onCancel?: () => void;
  isCancelling?: boolean;
}

const statusConfig: Record<BatchTaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '等待中', color: 'text-gray-500', icon: <PauseCircle className="w-5 h-5" /> },
  queued: { label: '队列中', color: 'text-blue-500', icon: <Loader2 className="w-5 h-5 animate-spin" /> },
  running: { label: '执行中', color: 'text-amber-500', icon: <Loader2 className="w-5 h-5 animate-spin" /> },
  paused: { label: '已暂停', color: 'text-yellow-500', icon: <PauseCircle className="w-5 h-5" /> },
  completed: { label: '已完成', color: 'text-green-500', icon: <CheckCircle2 className="w-5 h-5" /> },
  partial: { label: '部分完成', color: 'text-orange-500', icon: <AlertCircle className="w-5 h-5" /> },
  cancelled: { label: '已取消', color: 'text-gray-500', icon: <XCircle className="w-5 h-5" /> },
  failed: { label: '失败', color: 'text-red-500', icon: <XCircle className="w-5 h-5" /> },
};

export const BatchTaskProgress: React.FC<BatchTaskProgressProps> = ({
  task,
  onCancel,
  isCancelling = false,
}) => {
  if (!task) return null;

  const config = statusConfig[task.status];
  const canCancel = ['pending', 'queued', 'running', 'paused'].includes(task.status);

  return (
    <div className="sticky top-0 z-10 mb-4 p-4 rounded-xl bg-cream-50 dark:bg-cream-900/20 border border-cream-200 dark:border-cream-800">
      {/* 头部信息 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={config.color}>{config.icon}</span>
          <span className={`font-medium ${config.color}`}>{config.label}</span>
          <span className="text-sm text-gray-500">
            ({task.mode === 'serial' ? '串行' : task.mode === 'parallel' ? '并行' : '批量组合'})
          </span>
        </div>
        
        {canCancel && onCancel && (
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition disabled:opacity-50"
          >
            {isCancelling ? '取消中...' : '停止'}
          </button>
        )}
      </div>

      {/* 进度信息 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          进度 {task.progress.completed + task.progress.failed} / {task.progress.total}
        </span>
        <span className="text-sm font-medium text-cream-700 dark:text-cream-300">
          {task.progress.percentage.toFixed(1)}%
        </span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-cream-200 dark:bg-cream-800 rounded-full h-2.5">
        <div
          className="bg-cream-500 h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${task.progress.percentage}%` }}
        />
      </div>

      {/* 统计信息 */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span className="text-green-600">✓ {task.progress.completed} 成功</span>
        {task.progress.failed > 0 && (
          <span className="text-red-600">✗ {task.progress.failed} 失败</span>
        )}
        {task.credits.total > 0 && (
          <span>消耗: {task.credits.total - task.credits.refunded} 次</span>
        )}
      </div>

      {/* 错误信息 */}
      {task.error && (
        <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {task.error}
        </div>
      )}
    </div>
  );
};

export default BatchTaskProgress;
