import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard, Key, Coins, Gift, Users,
    LogOut, ShieldCheck, Ticket, MessageCircle, Layers, Mail
} from 'lucide-react';
import { useAuthStore } from '../../../store/useAuthStore';
import { getAdminUnreadCount } from '../../../services/ticketService';

type TabType = 'dashboard' | 'tokens' | 'pricing' | 'codes' | 'users' | 'tickets' | 'conversations' | 'queue' | 'email';

interface AdminSidebarProps {
    activeTab: TabType;
    onChangeTab: (tab: TabType) => void;
    collapsed?: boolean;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeTab, onChangeTab, collapsed = false }) => {
    const { logout } = useAuthStore();
    const [ticketUnreadCount, setTicketUnreadCount] = useState(0);

    // 轮询获取工单未读数量
    useEffect(() => {
        const fetchUnreadCount = async () => {
            try {
                const data = await getAdminUnreadCount();
                setTicketUnreadCount(data.unread_count);
            } catch (error) {
                console.error('获取工单未读数量失败:', error);
            }
        };

        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000); // 每30秒刷新一次

        return () => clearInterval(interval);
    }, []);

    const navItems = [
        { id: 'dashboard', label: '总览', icon: LayoutDashboard },
        { id: 'tokens', label: 'Token 管理', icon: Key },
        { id: 'pricing', label: '模型与灵感值', icon: Coins },
        { id: 'codes', label: '兑换码', icon: Gift },
        { id: 'users', label: '用户管理', icon: Users },
        { id: 'tickets', label: '工单支持', icon: Ticket, showBadge: true },
        { id: 'conversations', label: '会话查看', icon: MessageCircle },
        { id: 'queue', label: '队列监控', icon: Layers },
        { id: 'email', label: '邮件配置', icon: Mail },
    ] as const;

    return (
        <aside className={`
            fixed inset-y-0 left-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-r border-cream-200 dark:border-gray-800
            transition-all duration-300 ease-in-out flex flex-col
            ${collapsed ? 'w-20' : 'w-72'}
        `}>
            {/* Logo Area */}
            <div className="h-16 flex items-center px-6 border-b border-cream-100 dark:border-gray-800/50">
                <div className="flex items-center gap-3">
                    <img src="/logo_new.png" alt="Logo" className="w-8 h-8 rounded-xl shadow-lg shadow-cream-500/20" />
                    {!collapsed && (
                        <div>
                            <h1 className="font-bold text-gray-900 dark:text-white leading-none">管理后台</h1>
                            <p className="text-[10px] text-cream-600 dark:text-cream-400 font-medium tracking-wider mt-1 uppercase">控制台</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 scrollbar-hide">
                <div className="mb-2 px-3">
                    {!collapsed && <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">平台管理</p>}
                </div>

                {navItems.map((item) => {
                    const isActive = activeTab === item.id;
                    const Icon = item.icon;
                    const showBadge = item.showBadge && ticketUnreadCount > 0;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onChangeTab(item.id)}
                            className={`
                                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
                                ${isActive
                                    ? 'bg-cream-50 dark:bg-cream-900/20 text-cream-700 dark:text-cream-400 font-medium shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'
                                }
                                ${collapsed ? 'justify-center' : ''}
                            `}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-cream-500 rounded-r-full" />
                            )}
                            <Icon
                                size={20}
                                className={`
                                    transition-colors duration-200
                                    ${isActive ? 'text-cream-600 dark:text-cream-400' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}
                                `}
                            />
                            {!collapsed && (
                                <span className="flex items-center gap-2">
                                    {item.label}
                                </span>
                            )}

                            {/* 红点提醒（类似微信朋友圈） */}
                            {showBadge && (
                                <span className={`flex items-center ${collapsed ? 'absolute top-1 right-1' : ''}`}>
                                    {/* 脉冲动画 */}
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                                    {/* 红点 */}
                                    <span className="relative inline-flex items-center justify-center rounded-full bg-red-500">
                                        {ticketUnreadCount > 99 ? (
                                            // 超过99显示99+
                                            <span className="text-[8px] font-bold text-white min-w-[14px] h-[14px] px-0.5">
                                                99+
                                            </span>
                                        ) : ticketUnreadCount > 1 ? (
                                            // 多个未读显示数字
                                            <span className="text-[8px] font-bold text-white min-w-[14px] h-[14px] px-1">
                                                {ticketUnreadCount}
                                            </span>
                                        ) : (
                                            // 单个未读只显示红点
                                            <span className="w-2 h-2"></span>
                                        )}
                                    </span>
                                </span>
                            )}

                            {/* Tooltip for collapsed mode */}
                            {collapsed && (
                                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                                    {item.label}
                                </div>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-cream-100 dark:border-gray-800/50">
                <button
                    onClick={logout}
                    className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors
                        ${collapsed ? 'justify-center' : ''}
                    `}
                >
                    <LogOut size={20} />
                    {!collapsed && <span className="font-medium">退出登录</span>}
                </button>
            </div>
        </aside>
    );
};
