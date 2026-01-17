import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Activity, AlertCircle, CheckCircle, Clock, Download, Layers,
    PauseCircle, Play, RefreshCw, Server, Trash2, XCircle, Zap, TrendingUp,
    Minus
} from 'lucide-react';
import {
    DashboardData, getQueueDashboard, getQueueTasks, getQueueWorkers,
    retryTask, cancelTask, purgeQueue, restartWorkers, TaskInfo, WorkerInfo
} from '../../../services/adminService';
import { ADMIN_CONFIG } from '../../../constants/admin';
import { LoadingState } from '../common';

// 队列状态卡片
interface QueueStatCardProps {
    name: string;
    count: number;
    icon: React.ComponentType<any>;
    color: string;
    onClick?: () => void;
}

const QueueStatCard: React.FC<QueueStatCardProps> = ({ name, count, icon: Icon, color, onClick }) => (
    <button
        onClick={onClick}
        className={`bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all ${onClick ? 'cursor-pointer hover:border-gray-300 dark:hover:border-gray-700' : ''
            }`}
    >
        <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider mb-0.5 sm:mb-1 truncate">{name}</p>
                <p className={`text-lg sm:text-2xl font-bold ${color} tabular-nums`}>{count.toLocaleString()}</p>
            </div>
            <div className={`p-2 sm:p-3 rounded-xl flex-shrink-0 ${color.replace('text-', 'bg-').replace('-600', '/20').replace('-500', '/20')} ${color}`}>
                <Icon size={18} className="sm:w-[22px] sm:h-[22px]" />
            </div>
        </div>
    </button>
);

// 任务状态标签
interface TaskStatusBadgeProps {
    status: string;
}

const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({ status }) => {
    const config: Record<string, { color: string; icon: React.ComponentType<any>; label: string; shortLabel?: string }> = {
        pending: { color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20', icon: Clock, label: '等待中', shortLabel: '等待' },
        active: { color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: Play, label: '执行中', shortLabel: '执行' },
        succeeded: { color: 'text-green-600 bg-emerald-50 dark:bg-emerald-900/20', icon: CheckCircle, label: '成功' },
        failed: { color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: XCircle, label: '失败' },
        revoked: { color: 'text-gray-600 bg-gray-100 dark:bg-gray-800', icon: Minus, label: '已取消', shortLabel: '取消' },
    };

    const { color, icon: Icon, label, shortLabel } = config[status] || config.pending;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${color} flex-shrink-0`}>
            <Icon size={10} className="w-3 h-3 sm:w-3 sm:h-3" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{shortLabel || label.slice(0, 2)}</span>
        </span>
    );
};

const normalizeTimestamp = (value?: number): number | null => {
    if (!value) return null;
    return value < 1e12 ? value * 1000 : value;
};

// 格式化执行时长
const formatDuration = (startTime?: number, duration?: number): string => {
    if (typeof duration === 'number' && !Number.isNaN(duration)) {
        return `${duration.toFixed(1)}s`;
    }
    const startMs = normalizeTimestamp(startTime);
    if (!startMs) return '--';
    const seconds = Math.floor((Date.now() - startMs) / 1000);
    if (seconds < 0) return '--';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    return `${minutes}m ${remainSeconds}s`;
};

const formatTimestamp = (value?: number): string => {
    const ts = normalizeTimestamp(value);
    if (!ts) return '--';
    return new Date(ts).toLocaleString();
};

// 任务列表项
interface TaskItemProps {
    task: TaskInfo;
    onRetry: (taskId: string) => void;
    onCancel: (taskId: string) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, onRetry, onCancel }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div
                className="p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors gap-2"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                    <TaskStatusBadge status={task.status} />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {task.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-500 font-mono truncate">
                                ID: {task.id.slice(0, 8)}...
                            </p>
                            {(task.time_start || typeof task.duration === 'number') && (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Clock size={10} />
                                    {formatDuration(task.time_start, task.duration)}
                                </span>
                            )}
                        </div>
                    </div>
                    {task.worker && (
                        <span className="hidden sm:inline-flex text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            {task.worker.split('@')[0]}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 ml-2">
                    {task.status === 'failed' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onRetry(task.id); }}
                            className="p-1.5 sm:p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                            title="重试"
                        >
                            <RefreshCw size={14} className="sm:w-4 sm:h-4" />
                        </button>
                    )}
                    {(task.status === 'pending' || task.status === 'active') && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onCancel(task.id); }}
                            className="p-1.5 sm:p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            title="取消"
                        >
                            <XCircle size={14} className="sm:w-4 sm:h-4" />
                        </button>
                    )}
                    <button
                        className={`p-1.5 sm:p-2 rounded-lg transition-transform ${expanded ? 'rotate-180' : ''}`}
                    >
                        <Layers size={14} className="sm:w-4 sm:h-4 text-gray-400" />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-gray-500 mb-1">任务 ID</p>
                            <p className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded break-all">
                                {task.id}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-500 mb-1">队列 / Worker</p>
                            <p className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded break-all">
                                {(task.queue || '--')}{task.worker ? ` / ${task.worker}` : ''}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-500 mb-1">开始时间</p>
                            <p className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">
                                {formatTimestamp(task.time_start)}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-500 mb-1">时长</p>
                            <p className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">
                                {formatDuration(task.time_start, task.duration)}
                            </p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-gray-500 mb-1">参数</p>
                            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
                                {JSON.stringify(task.kwargs || task.args || {}, null, 2)}
                            </pre>
                        </div>
                        {task.result !== undefined && (
                            <div className="col-span-2">
                                <p className="text-gray-500 mb-1">结果</p>
                                <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
                                    {JSON.stringify(task.result, null, 2)}
                                </pre>
                            </div>
                        )}
                        {task.error && (
                            <div className="col-span-2">
                                <p className="text-gray-500 mb-1">错误信息</p>
                                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                                    {task.error}
                                </p>
                            </div>
                        )}
                        {task.traceback && (
                            <div className="col-span-2">
                                <p className="text-gray-500 mb-1">Traceback</p>
                                <pre className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded overflow-auto max-h-40">
                                    {task.traceback}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Worker 状态卡片
interface WorkerCardProps {
    worker: WorkerInfo;
}

const WorkerCard: React.FC<WorkerCardProps> = ({ worker }) => {
    const isOnline = worker.status === 'online';
    return (
        <div className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl border ${isOnline
                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            }`}>
            <div className={`p-1.5 sm:p-2 rounded-lg ${isOnline
                    ? 'bg-green-500'
                    : 'bg-gray-400'
                }`}>
                <Server size={12} className="sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                    {worker.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${isOnline ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                        {isOnline ? '在线' : '离线'}
                    </span>
                    {isOnline && worker.active_tasks !== undefined && (
                        <span className="text-xs text-gray-500">
                            {worker.active_tasks} 任务
                        </span>
                    )}
                </div>
            </div>
            <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 ${isOnline
                    ? 'bg-green-500 animate-pulse'
                    : 'bg-gray-400'
                }`} />
        </div>
    );
};

// 日志条目
interface LogEntry {
    id: string;
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'success';
    message: string;
    details?: string;
}

const LogViewer: React.FC<{ logs: LogEntry[]; onClear: () => void }> = ({ logs, onClear }) => {
    const levelConfig: Record<string, { color: string; icon: React.ComponentType<any> }> = {
        info: { color: 'text-blue-400', icon: Activity },
        warning: { color: 'text-yellow-400', icon: AlertCircle },
        error: { color: 'text-red-400', icon: XCircle },
        success: { color: 'text-green-400', icon: CheckCircle },
    };

    return (
        <div className="bg-gray-900 dark:bg-gray-950 rounded-xl p-3 sm:p-4 font-mono text-xs">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="text-gray-400 text-xs">实时日志 ({logs.length})</span>
                {logs.length > 0 && (
                    <button
                        onClick={onClear}
                        className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1 transition-colors"
                    >
                        <Trash2 size={12} />
                        <span className="hidden sm:inline">清空</span>
                    </button>
                )}
            </div>
            <div className="space-y-1 max-h-40 sm:max-h-48 overflow-y-auto">
                {logs.length === 0 ? (
                    <p className="text-gray-600 text-xs text-center py-4">暂无日志</p>
                ) : (
                    logs.map((log) => {
                        const { color, icon: Icon } = levelConfig[log.level] || levelConfig.info;
                        return (
                            <div key={log.id} className="flex items-start gap-2 text-gray-300">
                                <Icon size={10} className={color + ' mt-0.5 flex-shrink-0'} />
                                <span className="text-gray-600 text-[10px] sm:text-xs flex-shrink-0">{log.timestamp}</span>
                                <span className="flex-1 break-all">{log.message}</span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

// 主组件
export const QueueMonitor: React.FC = () => {
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [tasks, setTasks] = useState<TaskInfo[]>([]);
    const [workers, setWorkers] = useState<WorkerInfo[]>([]);
    const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // 添加日志
    const addLog = useCallback((level: LogEntry['level'], message: string, details?: string) => {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        setLogs(prev => [{ id: Date.now().toString() + Math.random(), timestamp, level, message, details }, ...prev].slice(0, 100));
    }, []);

    // 加载数据
    const loadData = useCallback(async () => {
        try {
            const [dashData, tasksData, workersData] = await Promise.all([
                getQueueDashboard(),
                getQueueTasks({ queue: selectedQueue || undefined, status: selectedStatus || undefined, limit: ADMIN_CONFIG.PAGE_SIZE }),
                getQueueWorkers(),
            ]);
            setDashboard(dashData);
            setTasks(tasksData.tasks);
            setWorkers(workersData.workers);
        } catch (error) {
            addLog('error', `加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedQueue, selectedStatus, addLog]);

    // 刷新
    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        addLog('info', '正在刷新队列数据...');
        loadData();
    }, [loadData, addLog]);

    // 重试任务
    const handleRetry = useCallback(async (taskId: string) => {
        try {
            await retryTask(taskId);
            addLog('success', `任务 ${taskId.slice(0, 8)}... 已重新提交`);
            handleRefresh();
        } catch (error) {
            addLog('error', `重试失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }, [addLog, handleRefresh]);

    // 取消任务
    const handleCancel = useCallback(async (taskId: string) => {
        try {
            await cancelTask(taskId);
            addLog('info', `任务 ${taskId.slice(0, 8)}... 已取消`);
            handleRefresh();
        } catch (error) {
            addLog('error', `取消失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }, [addLog, handleRefresh]);

    // 清空队列
    const handlePurgeQueue = useCallback(async (queue: string) => {
        if (!confirm(`确定要清空队列 "${queue}" 吗？这将删除所有待处理的任务。`)) return;

        try {
            await purgeQueue(queue);
            addLog('success', `队列 "${queue}" 已清空`);
            handleRefresh();
        } catch (error) {
            addLog('error', `清空队列失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }, [addLog, handleRefresh]);

    // 重启 Workers
    const handleRestartWorkers = useCallback(async () => {
        if (!confirm('确定要重启所有 Worker 进程吗？这会等待当前任务完成后重启。')) return;

        try {
            await restartWorkers();
            addLog('success', 'Worker 重启请求已发送');
        } catch (error) {
            addLog('error', `重启失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }, [addLog]);

    // 导出任务列表
    const handleExportTasks = useCallback(() => {
        const data = JSON.stringify(tasks, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queue_tasks_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('success', `已导出 ${tasks.length} 个任务`);
    }, [tasks, addLog]);

    // 使用 ref 保存最新的 loadData 回调，避免定时器重置
    const loadDataRef = useRef(loadData);
    useEffect(() => {
        loadDataRef.current = loadData;
    }, [loadData]);

    // 自动刷新
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            loadDataRef.current();
        }, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        addLog('info', '队列监控已启动');
    }, [addLog]);

    // 计算队列总数
    const totalPending = dashboard?.overview?.tasks?.pending || 0;
    const totalActive = dashboard?.overview?.tasks?.active || 0;
    const onlineWorkers = dashboard?.overview?.workers?.online || 0;
    const totalWorkers = dashboard?.overview?.workers?.total || 0;
    const throughputHour = dashboard?.throughput?.last_hour || 0;
    const throughputDay = dashboard?.throughput?.last_day || 0;

    const failedCount = dashboard?.overview?.tasks?.failed ?? tasks.filter(t => t.status === 'failed').length;
    const succeededCount = dashboard?.overview?.tasks?.succeeded ?? tasks.filter(t => t.status === 'succeeded').length;
    const AutoRefreshIcon = autoRefresh ? PauseCircle : Play;

    if (loading) {
        return (
            <div className="h-64">
                <LoadingState message="加载队列数据中..." className="h-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4 lg:space-y-6 animate-fade-in-up">
            {/* 顶部操作栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">队列监控中心</h2>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1.5 ${
                        autoRefresh
                            ? 'bg-green-100 dark:bg-green-900/20 text-green-600'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                            autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                        }`} />
                        {autoRefresh ? '实时' : '暂停'}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${autoRefresh
                                ? 'bg-green-100 dark:bg-green-900/20 text-green-600'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600'
                            }`}
                    >
                        <AutoRefreshIcon size={14} className="sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">自动刷新</span>
                        <span className="sm:hidden">自动</span>
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs sm:text-sm font-medium transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        <span className="hidden sm:inline">刷新</span>
                    </button>
                    <button
                        onClick={handleRestartWorkers}
                        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-xl bg-cream-100 dark:bg-cream-900/20 hover:bg-cream-200 dark:hover:bg-cream-900/30 text-cream-600 text-xs sm:text-sm font-medium transition-all"
                    >
                        <Zap size={14} className="sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">重启</span>
                    </button>
                </div>
            </div>

            {/* 状态卡片 - 增强版 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
                <QueueStatCard
                    name="等待"
                    count={totalPending}
                    icon={Clock}
                    color="text-yellow-600"
                    onClick={() => setSelectedStatus(selectedStatus === 'pending' ? null : 'pending')}
                />
                <QueueStatCard
                    name="执行中"
                    count={totalActive}
                    icon={Activity}
                    color="text-blue-600"
                    onClick={() => setSelectedStatus(selectedStatus === 'active' ? null : 'active')}
                />
                <QueueStatCard
                    name="成功"
                    count={succeededCount}
                    icon={CheckCircle}
                    color="text-emerald-600"
                    onClick={() => setSelectedStatus(selectedStatus === 'succeeded' ? null : 'succeeded')}
                />
                <QueueStatCard
                    name="失败"
                    count={failedCount}
                    icon={XCircle}
                    color="text-red-600"
                    onClick={() => setSelectedStatus(selectedStatus === 'failed' ? null : 'failed')}
                />
                <QueueStatCard
                    name="在线 Worker"
                    count={onlineWorkers}
                    icon={Server}
                    color="text-green-600"
                />
                <QueueStatCard
                    name="总 Worker"
                    count={totalWorkers}
                    icon={Layers}
                    color="text-gray-600"
                />
            </div>

            {/* 吞吐量卡片 */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-2xl p-4 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">过去 1 小时处理</p>
                            <p className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-300">{throughputHour.toLocaleString()}</p>
                        </div>
                        <div className="p-2.5 sm:p-3 rounded-xl bg-blue-500/20 text-blue-600">
                            <TrendingUp size={18} className="sm:w-5 sm:h-5" />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-2xl p-4 border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">过去 24 小时处理</p>
                            <p className="text-xl sm:text-2xl font-bold text-purple-700 dark:text-purple-300">{throughputDay.toLocaleString()}</p>
                        </div>
                        <div className="p-2.5 sm:p-3 rounded-xl bg-purple-500/20 text-purple-600">
                            <Activity size={18} className="sm:w-5 sm:h-5" />
                        </div>
                    </div>
                </div>
            </div>

            {/* 队列详情 */}
            <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
                {/* 任务列表 */}
                <div className="lg:col-span-2 space-y-3 sm:space-y-4">
                    {/* 过滤器 */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <select
                            value={selectedQueue || ''}
                            onChange={(e) => setSelectedQueue((e.currentTarget.value || null) as string | null)}
                            className="px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm"
                        >
                            <option value="">全部队列</option>
                            <option value="default">default</option>
                            <option value="email">email</option>
                            <option value="cleanup">cleanup</option>
                            <option value="api">api</option>
                            <option value="stats">stats</option>
                            <option value="low">low</option>
                        </select>
                        <select
                            value={selectedStatus || ''}
                            onChange={(e) => setSelectedStatus((e.currentTarget.value || null) as string | null)}
                            className="px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm"
                        >
                            <option value="">全部状态</option>
                            <option value="pending">等待中</option>
                            <option value="active">执行中</option>
                            <option value="failed">失败</option>
                            <option value="succeeded">成功</option>
                            <option value="revoked">已取消</option>
                        </select>
                        <button
                            onClick={handleExportTasks}
                            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs sm:text-sm transition-all"
                        >
                            <Download size={12} className="sm:w-3.5 sm:h-3.5" />
                            <span>导出</span>
                        </button>
                    </div>

                    {/* 任务列表 */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                            <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">
                                任务列表 <span className="text-gray-400 font-normal">({tasks.length})</span>
                            </h3>
                            {/* 队列快速统计 */}
                            {dashboard?.overview?.queues && Object.keys(dashboard.overview.queues).length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {Object.entries(dashboard.overview.queues).map(([name, count]) => (
                                        <button
                                            key={name}
                                            onClick={() => count > 0 && handlePurgeQueue(name)}
                                            className={`text-xs px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                                                count > 0
                                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30'
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                            }`}
                                            title={count > 0 ? `清空 ${name} 队列` : `${name} 队列为空`}
                                        >
                                            {count > 0 && <Trash2 size={10} />}
                                            {name}: {count}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 max-h-80 sm:max-h-96 overflow-y-auto">
                            {tasks.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">暂无任务</p>
                                </div>
                            ) : (
                                tasks.map((task) => (
                                    <TaskItem
                                        key={task.id}
                                        task={task}
                                        onRetry={handleRetry}
                                        onCancel={handleCancel}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* 右侧边栏 */}
                <div className="space-y-4 lg:space-y-6">
                    {/* Workers 状态 */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm sm:text-base">
                                <Server size={16} className="text-amber-500" />
                                Workers <span className="text-gray-400 font-normal">({workers.length})</span>
                            </h3>
                        </div>
                        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 max-h-60 overflow-y-auto">
                            {workers.length === 0 ? (
                                <p className="text-center text-gray-400 text-xs sm:text-sm py-4">暂无 Worker</p>
                            ) : (
                                workers.map((worker, idx) => (
                                    <WorkerCard key={idx} worker={worker} />
                                ))
                            )}
                        </div>
                    </div>

                    {/* 日志查看器 */}
                    <LogViewer logs={logs} onClear={() => setLogs([])} />
                </div>
            </div>
        </div>
    );
};
