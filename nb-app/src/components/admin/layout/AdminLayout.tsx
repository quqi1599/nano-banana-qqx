import React, { useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';

type TabType = 'dashboard' | 'tokens' | 'pricing' | 'codes' | 'users' | 'tickets' | 'conversations' | 'queue' | 'email';

interface AdminLayoutProps {
    activeTab: TabType;
    onChangeTab: (tab: TabType) => void;
    children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ activeTab, onChangeTab, children }) => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const getTitle = () => {
        switch (activeTab) {
            case 'dashboard': return 'Dashboard Overview';
            case 'tokens': return 'Token Management';
            case 'pricing': return 'Models & Pricing';
            case 'codes': return 'Redeem Codes';
            case 'users': return 'User Management';
            case 'tickets': return 'Support Tickets';
            case 'conversations': return 'Conversations';
            case 'queue': return 'Queue Monitoring';
            case 'email': return 'Email Settings';
            default: return 'Admin Console';
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
