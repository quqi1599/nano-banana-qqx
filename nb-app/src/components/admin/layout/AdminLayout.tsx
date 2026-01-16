import React, { useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';

type TabType = 'dashboard' | 'tokens' | 'pricing' | 'codes' | 'users' | 'tickets' | 'conversations' | 'queue' | 'email' | 'visitors';

interface AdminLayoutProps {
    activeTab: TabType;
    onChangeTab: (tab: TabType) => void;
    children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ activeTab, onChangeTab, children }) => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const getTitle = () => {
        switch (activeTab) {
            case 'dashboard': return '总览';
            case 'tokens': return 'Token 管理';
            case 'pricing': return '模型与定价';
            case 'codes': return '兑换码';
            case 'users': return '用户管理';
            case 'tickets': return '工单支持';
            case 'conversations': return '会话查看';
            case 'queue': return '队列监控';
            case 'email': return '邮件配置';
            case 'visitors': return '游客管理';
            default: return '管理控制台';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans">
            <AdminSidebar
                activeTab={activeTab}
                onChangeTab={onChangeTab}
                collapsed={sidebarCollapsed}
            />

            <div className={`transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'}`}>
                <AdminHeader
                    title={getTitle()}
                    onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
                />

                <main className="p-6 lg:p-8 max-w-[1600px] mx-auto min-h-[calc(100vh-4rem)]">
                    <div className="animate-fade-in-up">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
