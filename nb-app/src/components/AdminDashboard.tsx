/**
 * 管理员专属全屏后台页面
 */
import React, { useState, useEffect } from 'react';
import { AdminLayout } from './admin/layout/AdminLayout';
import { AdminOverview } from './admin/dashboard/AdminOverview';
import { AdminTokens } from './admin/tokens/AdminTokens';
import { AdminPricing } from './admin/settings/AdminPricing';
import { AdminRedeemCodes } from './admin/settings/AdminRedeemCodes';
import { AdminTickets } from './admin/tickets/AdminTickets';
import { AdminConversations } from './admin/conversations/AdminConversations';
import { QueueMonitor } from './admin/queue/QueueMonitor';
import { EmailSettings } from './admin/email';
import { UserManagementPanel } from './UserManagementPanel';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import { getDashboardStats, getLoginFailureIps, DashboardStats, LoginFailureResult } from '../services/adminService';
import { getApiBaseUrl } from '../utils/endpointUtils';

interface AdminDashboardProps {
    onLogout: () => void;
    onExit?: () => void;
}

type TabType = 'dashboard' | 'tokens' | 'pricing' | 'codes' | 'users' | 'tickets' | 'conversations' | 'queue' | 'email';

export const AdminDashboard = ({ onLogout, onExit }: AdminDashboardProps) => {
    const { logout } = useAuthStore();
    const { settings } = useAppStore();
    const apiBaseUrl = getApiBaseUrl(settings.customEndpoint);
    const [activeTab, setActiveTab] = useState<TabType>('dashboard');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // 用户对话筛选状态
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedUserInfo, setSelectedUserInfo] = useState<{ email: string; nickname?: string | null } | null>(null);

    // Dashboard Stats State (kept here to pass to AdminOverview, or could move into AdminOverview?)
    // AdminOverview takes props: stats, isLoading, etc.
    // It seems AdminDashboard orchestrates the stats fetching for the Overview.
    // Let's keep it here for now or refactor AdminOverview to fetch its own data?
    // Looking at previous AdminDashboard, it fetched stats for dashboard tab.
    // AdminOverview exported from './admin/dashboard/AdminOverview' accepts props.
    // Ideally AdminOverview should fetch its own data to be self-contained, but for now I will keep the fetch logic here to minimize changes to AdminOverview.

    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [modelStatsLoaded, setModelStatsLoaded] = useState(false);
    const [dailyStatsLoaded, setDailyStatsLoaded] = useState(false);
    const [modelStatsLoading, setModelStatsLoading] = useState(false);
    const [dailyStatsLoading, setDailyStatsLoading] = useState(false);
    const [loginFailures, setLoginFailures] = useState<LoginFailureResult | null>(null);
    const [loginFailuresLoading, setLoginFailuresLoading] = useState(false);

    const loadLoginFailures = async () => {
        setLoginFailuresLoading(true);
        try {
            const data = await getLoginFailureIps(50);
            setLoginFailures(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoginFailuresLoading(false);
        }
    };

    const loadDashboardData = async () => {
        setIsLoading(true);
        setError('');
        try {
            const [data, failures] = await Promise.all([
                getDashboardStats(undefined, undefined, {
                    includeDailyStats: false,
                    includeModelStats: false,
                }),
                getLoginFailureIps(50),
            ]);
            setStats(data);
            setDailyStatsLoaded(false);
            setModelStatsLoaded(false);
            setLoginFailures(failures);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const loadModelStats = async () => {
        if (!stats || modelStatsLoading) return;
        setModelStatsLoading(true);
        setError('');
        try {
            const data = await getDashboardStats(undefined, undefined, {
                includeDailyStats: false,
                includeModelStats: true,
            });
            setStats((prev) => prev ? { ...prev, ...data, daily_stats: prev.daily_stats } : data);
            setModelStatsLoaded(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setModelStatsLoading(false);
        }
    };

    const loadDailyStats = async () => {
        if (!stats || dailyStatsLoading) return;
        setDailyStatsLoading(true);
        setError('');
        try {
            const data = await getDashboardStats(undefined, undefined, {
                includeDailyStats: true,
                includeModelStats: false,
            });
            setStats((prev) => prev ? { ...prev, ...data, model_stats: prev.model_stats } : data);
            setDailyStatsLoaded(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDailyStatsLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'dashboard') {
            loadDashboardData();
        }
    }, [activeTab]);

    const handleLogout = () => {
        logout();
        onLogout();
    };

    // 处理从用户管理面板查看对话
    const handleViewConversations = (userId: string, userEmail: string, userNickname?: string | null) => {
        setSelectedUserId(userId);
        setSelectedUserInfo({ email: userEmail, nickname: userNickname });
        setActiveTab('conversations');
    };

    // 清除用户筛选
    const handleClearUserFilter = () => {
        setSelectedUserId(null);
        setSelectedUserInfo(null);
    };

    return (
        <AdminLayout activeTab={activeTab} onChangeTab={setActiveTab}>
            {error && activeTab === 'dashboard' && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3 animate-fade-in-up">
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></span>
                    {error}
                </div>
            )}

            {activeTab === 'dashboard' && (
                <AdminOverview
                    stats={stats}
                    isLoading={isLoading}
                    modelStatsLoading={modelStatsLoading}
                    dailyStatsLoading={dailyStatsLoading}
                    modelStatsLoaded={modelStatsLoaded}
                    dailyStatsLoaded={dailyStatsLoaded}
                    onLoadModelStats={loadModelStats}
                    onLoadDailyStats={loadDailyStats}
                    loginFailures={loginFailures}
                    loginFailuresLoading={loginFailuresLoading}
                    onReloadLoginFailures={loadLoginFailures}
                />
            )}

            {activeTab === 'tokens' && <AdminTokens />}

            {activeTab === 'pricing' && <AdminPricing />}

            {activeTab === 'codes' && <AdminRedeemCodes />}

            {activeTab === 'users' && <UserManagementPanel apiBase={apiBaseUrl} onViewConversations={handleViewConversations} />}

            {activeTab === 'tickets' && <AdminTickets />}

            {activeTab === 'conversations' && (
                <AdminConversations
                    userId={selectedUserId}
                    userInfo={selectedUserInfo}
                    onClearUserFilter={handleClearUserFilter}
                />
            )}

            {activeTab === 'queue' && <QueueMonitor />}
            {activeTab === 'email' && <EmailSettings />}

        </AdminLayout>
    );
};
