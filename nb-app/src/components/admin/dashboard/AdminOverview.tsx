import React from 'react';
import { Activity, BarChart3, Coins, Image, Users, TrendingUp } from 'lucide-react';
import { DashboardStats } from '../../../services/adminService';
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
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
    stats,
    modelStatsLoading,
    dailyStatsLoading,
    modelStatsLoaded,
    dailyStatsLoaded,
    onLoadModelStats,
    onLoadDailyStats,
}) => {
    if (!stats) return null;

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Primary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Today's Consumption"
                    value={stats.today_credits_used}
                    suffix="credits"
                    icon={Coins}
                    color="amber"
                />
                <StatCard
                    label="Images Generated"
                    value={stats.today_image_calls}
                    suffix="images"
                    icon={Image}
                    color="orange"
                />
                <StatCard
                    label="Active Users"
                    value={stats.active_users_today}
                    suffix="users"
                    icon={Users}
                    color="blue"
                />
                <StatCard
                    label="Total Requests"
                    value={stats.total_requests_today}
                    suffix="requests"
                    icon={Activity}
                    color="green"
                />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Users</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_users}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Credits Consumed</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_credits_consumed.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Token Pool Health</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-green-600">{stats.available_tokens}</span>
                        <span className="text-xs text-gray-400">/ {stats.token_pool_count} available</span>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-cream-100 dark:border-gray-800 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">System Status</p>
                    <p className="text-xl font-bold text-green-600 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Operational
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
                        Model Usage Distribution
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
                                                    <span>{m.total_requests.toLocaleString()} reqs</span>
                                                    <span>{m.total_credits_used.toLocaleString()} credits</span>
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
                                <p className="text-sm">No usage data for today</p>
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
                                {modelStatsLoading ? 'Loading data...' : 'Load Model Analysis'}
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
                        7-Day Usage Trend
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
                                <p className="text-sm">No historical data available</p>
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
                                {dailyStatsLoading ? 'Loading charts...' : 'Load 7-Day Trend'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
