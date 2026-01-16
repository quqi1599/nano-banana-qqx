import React, { useCallback, useEffect, useState } from 'react';
import {
    Activity, AlertCircle, CheckCircle, Clock, Download, Layers,
    PauseCircle, Play, RefreshCw, Server, Trash2, XCircle, Zap
} from 'lucide-react';
import {
    DashboardData, getQueueDashboard, getQueueTasks, getQueueWorkers,
    retryTask, cancelTask, purgeQueue, restartWorkers, TaskInfo, WorkerInfo
} from '../../../services/adminService';

// 队列状态卡片
interface QueueStatCardProps {
    name: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    onClick?: () => void;
}

const QueueStatCard: React.FC<QueueStatCardProps> = ({ name, count, icon: Icon, color, onClick }) => (
    <button
        onClick={onClick}
        className={`bg-white dark:bg-gray-900 rounded-2xl p-5 border border-cream-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all ${
            onClick ? 'cursor-pointer hover:border-cream-200 dark:hover:border-gray-700' : ''
        }`}
    >
        <div className="flex items-center justify-between">
            <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{name}</p>
                <p className={`text-2xl font-bold ${color}`}>{count.toLocaleString()}</p>
            </div>
            <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('-600', '/20')} ${color}`}>
                <Icon size={22} />
            </div>
        </div>
    </button>
);

// 任务状态标签
interface TaskStatusBadgeProps {
    status: string;
}

const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({ status }) => {
    const config: Record<string, { color: string; icon: React.ComponentType<{ size?: number }>; label: string }> = {
        pending: { color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20', icon: Clock, label: '等待中' },
        active: { color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: Play, label: '执行中' },
        succeeded: { color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: CheckCircle, label: '成功' },
        failed: { color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: XCircle, label: '失败' },
    };

    const { color, icon: Icon, label } = config[status] || config.pending;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
            <Icon size={12} />
            {label}
        </span>
    );
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
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                    <TaskStatusBadge status={task.status} />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {task.name}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">
                            ID: {task.id.slice(0, 12)}...
                        </p>
                    </div>
                    {task.worker && (
                        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            {task.worker.split('@')[0]}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                    {task.status === 'failed' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onRetry(task.id); }}
                            className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                            title="重试"
                        >
                            <RefreshCw size={16} />
                        </button>
                    )}
                    {(task.status === 'pending' || task.status === 'active') && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onCancel(task.id); }}
                            className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            title="取消"
                        >
                            <XCircle size={16} />
                        </button>
                    )}
                    <button
                        className={`p-2 rounded-lg transition-transform ${expanded ? 'rotate-180' : ''}`}
                    >
                        <Layers size={16} className="text-gray-400" />
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
                            <p className="text-gray-500 mb-1">参数</p>
                            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
                                {JSON.stringify(task.kwargs || task.args || {}, null, 2)}
                            </pre>
                        </div>
                        {task.error && (
                            <div className="col-span-2">
                                <p className="text-gray-500 mb-1">错误信息</p>
                                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                                    {task.error}
                                </p>
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

const WorkerCard: React.FC<WorkerCardProps> = ({ worker }) => (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${
        worker.status === 'online'
            ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }`}>
        <div className={`p-2 rounded-lg ${
            worker.status === 'online'
                ? 'bg-green-500'
                : 'bg-gray-400'
        }`}>
            <Server size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {worker.name}
            </p>
            <p className="text-xs text-gray-500">
                {worker.status === 'online' && worker.active_tasks !== undefined
                    ? `${worker.active_tasks} 个活跃任务`
                    : '离线'}
            </p>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full ${
            worker.status === 'online'
                ? 'bg-green-500 animate-pulse'
                : 'bg-gray-400'
        }`} />
    </div>
);

// 日志条目
interface LogEntry {
    id: string;
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'success';
    message: string;
    details?: string;
}

const LogViewer: React.FC<{ logs: LogEntry[]; onClear: () => void }> = ({ logs, onClear }) => {
    const levelConfig: Record<string, { color: string; icon: React.ComponentType<{ size?: number }> }> = {
        info: { color: 'text-blue-600', icon: Activity },
        warning: { color: 'text-yellow-600', icon: AlertCircle },
        error: { color: 'text-red-600', icon: XCircle },
        success: { color: 'text-green-600', icon: CheckCircle },
    };

    return (
        <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm">
            <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-xs">实时日志</span>
                <button
                    onClick={onClear}
                    className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1"
                >
                    <Trash2 size={12} />
                    清空
                </button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {logs.length === 0 ? (
                    <p className="text-gray-600 text-xs text-center py-4">暂无日志</p>
                ) : (
                    logs.map((log) => {
                        const { color, icon: Icon } = levelConfig[log.level] || levelConfig.info;
                        return (
                            <div key={log.id} className="flex items-start gap-2 text-gray-300">
                                <Icon size={12} className={color + ' mt-0.5 flex-shrink-0'} />
                                <span className="text-gray-600 text-xs flex-shrink-0">{log.timestamp}</span>
                                <span className="flex-1">{log.message}</span>
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
                getQueueTasks({ queue: selectedQueue || undefined, status: selectedStatus || undefined, limit: 20 }),
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

    // 自动刷新
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            loadData();
        }, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh, loadData]);

    // 初始加载
    useEffect(() => {
        loadData();
        addLog('info', '队列监控已启动');
    }, []);

    // 计算队列总数
    const totalPending = dashboard?.overview?.tasks?.pending || 0;
    const totalActive = dashboard?.overview?.tasks?.active || 0;
    const onlineWorkers = dashboard?.overview?.workers?.online || 0;
    const totalWorkers = dashboard?.overview?.workers?.total || 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="animate-spin text-cream-500" size={32} />
                    <p className="text-gray-500">加载队列数据中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* 顶部操作栏 */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">队列监控中心</h2>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-600 text-xs font-medium rounded-full flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        实时
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                            autoRefresh
                                ? 'bg-green-100 dark:bg-green-900/20 text-green-600'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600'
                        }`}
                    >
                        <Play size={16} />
                        自动刷新
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        刷新
                    </button>
                    <button
                        onClick={handleRestartWorkers}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/20 hover:bg-amber-200 dark:hover:bg-amber-900/30 text-amber-600 text-sm font-medium transition-all"
                    >
                        <Zap size={16} />
                        重启 Workers
                    </button>
                </div>
            </div>

            {/* 状态卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <QueueStatCard
                    name="等待任务"
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
                    name="在线 Workers"
                    count={onlineWorkers}
                    icon={Server}
                    color="text-green-600"
                />
                <QueueStatCard
                    name="总 Workers"
                    count={totalWorkers}
                    icon={Layers}
                    color="text-gray-600"
                />
            </div>

            {/* 队列详情 */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* 任务列表 */}
                <div className="lg:col-span-2 space-y-4">
                    {/* 过滤器 */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <select
                            value={selectedQueue || ''}
                            onChange={(e) => setSelectedQueue(e.target.value || null)}
                            className="px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm"
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
                            onChange={(e) => setSelectedStatus(e.target.value || null)}
                            className="px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm"
                        >
                            <option value="">全部状态</option>
                            <option value="pending">等待中</option>
                            <option value="active">执行中</option>
                            <option value="failed">失败</option>
                            <option value="succeeded">成功</option>
                        </select>
                        <button
                            onClick={handleExportTasks}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm transition-all"
                        >
                            <Download size={14} />
                            导出
                        </button>
                    </div>

                    {/* 任务列表 */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-cream-100 dark:border-gray-800 shadow-sm">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <h3 className="font-bold text-gray-900 dark:text-white">
                                任务列表 ({tasks.length})
                            </h3>
                            {dashboard?.overview?.queues && Object.keys(dashboard.overview.queues).length > 0 && (
                                <div className="flex gap-2">
                                    {Object.entries(dashboard.overview.queues).map(([name, count]) => (
                                        count > 0 && (
                                            <button
                                                key={name}
                                                onClick={() => handlePurgeQueue(name)}
                                                className="text-xs px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center gap-1"
                                            >
                                                <Trash2 size={10} />
                                                {name}: {count}
                                            </button>
                                        )
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
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
                <div className="space-y-6">
                    {/* Workers 状态 */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-cream-100 dark:border-gray-800 shadow-sm">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Server size={18} className="text-cream-500" />
                                Workers ({workers.length})
                            </h3>
                        </div>
                        <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                            {workers.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-4">暂无 Worker</p>
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
