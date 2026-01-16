import React from 'react';
import {
    LayoutDashboard, Key, Coins, Gift, Users, MessageSquare,
    Settings, LogOut, ShieldCheck, Ticket, MessageCircle, Layers, Mail, UserPlus
} from 'lucide-react';
import { useAuthStore } from '../../../store/useAuthStore';

type TabType = 'dashboard' | 'tokens' | 'pricing' | 'codes' | 'users' | 'tickets' | 'conversations' | 'queue' | 'email' | 'visitors';

interface AdminSidebarProps {
    activeTab: TabType;
    onChangeTab: (tab: TabType) => void;
    collapsed?: boolean;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeTab, onChangeTab, collapsed = false }) => {
    const { logout } = useAuthStore();

    const navItems = [
        { id: 'dashboard', label: '总览', icon: LayoutDashboard },
        { id: 'tokens', label: 'Token 管理', icon: Key },
        { id: 'pricing', label: '模型与定价', icon: Coins },
        { id: 'codes', label: '兑换码', icon: Gift },
        { id: 'users', label: '用户管理', icon: Users },
        { id: 'tickets', label: '工单支持', icon: Ticket },
        { id: 'conversations', label: '会话查看', icon: MessageCircle },
        { id: 'queue', label: '队列监控', icon: Layers },
        { id: 'email', label: '邮件配置', icon: Mail },
        { id: 'visitors', label: '游客管理', icon: UserPlus },
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
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cream-400 to-cream-600 flex items-center justify-center text-white shadow-lg shadow-cream-500/20">
                        <ShieldCheck size={18} strokeWidth={2.5} />
                    </div>
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
                            {!collapsed && <span>{item.label}</span>}

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
