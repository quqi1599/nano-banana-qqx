import React from 'react';
import { Activity, BarChart3, Coins, Image, Users, TrendingUp } from 'lucide-react';
import { DashboardStats, LoginFailureResult } from '../../../services/adminService';
import { StatCard } from './StatCard';

interface AdminOverviewProps {
    stats: DashboardStats | null;
    isLoading: boolean;
    modelStatsLoading: boolean;
    dailyStatsLoading: boolean;
    modelStatsLoaded: boolean;
    dailyStatsLoaded: boolean;
    onLoadModelStats: () => void;
    onLoadDailyStats: () => void;
    loginFailures: LoginFailureResult | null;
    loginFailuresLoading: boolean;
    onReloadLoginFailures: () => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
    stats,
    modelStatsLoading,
    dailyStatsLoading,
    modelStatsLoaded,
    dailyStatsLoaded,
    onLoadModelStats,
    onLoadDailyStats,
    loginFailures,
    loginFailuresLoading,
    onReloadLoginFailures,
}) => {
    if (!stats) return null;

    const formatShortDate = (value?: string | null) => {
        if (!value) return '—';
        return new Date(value).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatTtl = (value?: number | null) => {
        if (!value || value <= 0) return '—';
        const minutes = Math.ceil(value / 60);
        return `${minutes} 分钟`;
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Primary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="今日消耗"
                    value={stats.today_credits_used}
                    suffix="积分"
                    icon={Coins}
                    color="amber"
                />
                <StatCard
                    label="生成图片数"
                    value={stats.today_image_calls}
                    suffix="张"
                    icon={Image}
                    color="orange"
                />
                <StatCard
                    label="活跃用户"
                    value={stats.active_users_today}
                    suffix="人"
                    icon={Users}
                    color="blue"
                />
                <StatCard
                    label="总请求数"
                    value={stats.total_requests_today}
                    suffix="次"
                    icon={Activity}
                    color="green"
                />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">总用户数</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_users}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">总消耗积分</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_credits_consumed.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Token 池状态</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-green-600">{stats.available_tokens}</span>
                        <span className="text-xs text-gray-400">/ {stats.token_pool_count} 可用</span>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">系统状态</p>
                    <p className="text-xl font-bold text-green-600 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        运行正常
                    </p>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Model Usage */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-cream-100 dark:bg-cream-900/20 text-cream-600">
                            <BarChart3 size={18} />
                        </div>
                        模型使用分布
                    </h3>
                    {modelStatsLoaded ? (
                        stats.model_stats.length > 0 ? (
                            <div className="space-y-5">
                                {stats.model_stats.map((m, idx) => {
                                    const colors = ['bg-amber-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500'];
                                    const percent = Math.min(100, (m.total_requests / Math.max(1, stats.total_requests_today)) * 100);
                                    return (
                                        <div key={m.model_name}>
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className="font-medium text-gray-700 dark:text-gray-300">{m.model_name}</span>
                                                <div className="text-gray-500 text-xs flex gap-2">
                                                    <span>{m.total_requests.toLocaleString()} 次请求</span>
                                                    <span>{m.total_credits_used.toLocaleString()} 积分</span>
                                                </div>
                                            </div>
                                            <div className="h-2.5 bg-gray-50 dark:bg-gray-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${colors[idx % colors.length]} transition-all duration-1000 ease-out`}
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400 bg-gray-50/50 dark:bg-gray-800/10 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm">今日暂无使用数据</p>
                            </div>
                        )
                    ) : (
                        <div className="text-center py-12">
                            <button
                                type="button"
                                onClick={onLoadModelStats}
                                disabled={modelStatsLoading}
                                className="px-5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-cream-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-sm font-medium transition-all"
                            >
                                {modelStatsLoading ? '加载数据中...' : '加载模型分析'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Daily Trend */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-600">
                            <TrendingUp size={18} />
                        </div>
                        近7日使用趋势
                    </h3>
                    {dailyStatsLoaded ? (
                        stats.daily_stats.length > 0 ? (
                            <div className="pt-4 h-full flex flex-col justify-end gap-2">
                                {/* Simple bar chart visualization */}
                                <div className="flex items-end justify-between h-48 gap-2">
                                    {stats.daily_stats.map(day => {
                                        const max = Math.max(1, ...stats.daily_stats.map(d => d.total_requests));
                                        const percent = (day.total_requests / max) * 100;
                                        return (
                                            <div key={day.date} className="flex-1 flex flex-col items-center group">
                                                <div className="relative w-full flex-1 flex items-end justify-center">
                                                    <div
                                                        className="w-full max-w-[24px] bg-green-100 dark:bg-green-900/20 rounded-t-lg group-hover:bg-green-200 dark:group-hover:bg-green-900/40 transition-colors relative"
                                                        style={{ height: `${percent}%` }}
                                                    >
                                                        <div className="absolute bottom-0 inset-x-0 h-full bg-gradient-to-t from-green-500/20 to-transparent rounded-t-lg"></div>
                                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {day.total_requests}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="mt-2 text-[10px] text-gray-400 font-medium rotate-0 truncate w-full text-center">
                                                    {day.date.slice(5)}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400 bg-gray-50/50 dark:bg-gray-800/10 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm">暂无历史数据</p>
                            </div>
                        )
                    ) : (
                        <div className="text-center py-12">
                            <button
                                type="button"
                                onClick={onLoadDailyStats}
                                disabled={dailyStatsLoading}
                                className="px-5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-cream-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-sm font-medium transition-all"
                            >
                                {dailyStatsLoading ? '加载图表中...' : '加载7日趋势'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-cream-100 dark:border-gray-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-white">登录失败监控</h3>
                        <p className="text-xs text-gray-400 mt-1">
                            近 {loginFailures?.total ?? 0} 个异常 IP
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onReloadLoginFailures}
                        className="text-xs font-semibold text-cream-600 hover:text-cream-700"
                    >
                        刷新
                    </button>
                </div>
                {loginFailuresLoading ? (
                    <div className="text-center py-8 text-gray-400">加载中...</div>
                ) : loginFailures?.items?.length ? (
                    <div className="space-y-3">
                        {loginFailures.items.slice(0, 10).map((item) => (
                            <div
                                key={item.ip}
                                className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3"
                            >
                                <div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{item.ip}</div>
                                    <div className="text-xs text-gray-400">
                                        最近 {formatShortDate(item.last_seen)} · {item.last_email || '—'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-semibold text-red-600">{item.count} 次</div>
                                    <div className="text-[10px] text-gray-400">过期 {formatTtl(item.ttl_seconds)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-400">暂无异常登录记录</div>
                )}
            </div>
        </div>
    );
};
