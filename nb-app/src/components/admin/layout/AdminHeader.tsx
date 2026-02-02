import React, { useState } from 'react';
import { Menu, Search, Sun, Moon } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';

interface AdminHeaderProps {
    title: string;
    onToggleSidebar: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ title, onToggleSidebar }) => {
    const { settings, updateSettings } = useAppStore();
    const [searchTerm, setSearchTerm] = useState('');

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const trimmed = searchTerm.trim();
        if (!trimmed) return;
        window.dispatchEvent(new CustomEvent('admin-search', { detail: trimmed }));
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(event.target.value);
    };

    const toggleTheme = () => {
        const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
        updateSettings({ theme: nextTheme });
    };

    return (
        <header className="sticky top-0 z-40 bg-white/70 dark:bg-gray-950/70 backdrop-blur-md border-b border-cream-100 dark:border-gray-800 transition-all duration-300">
            <div className="flex h-16 items-center justify-between px-6 gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onToggleSidebar}
                        className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Menu size={20} />
                    </button>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                        {title}
                    </h2>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search Bar - Hidden on mobile */}
                    <div className="hidden md:flex items-center relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-cream-500 transition-colors" />
                        <input
                            type="text"
                            aria-label="管理员搜索"
                            value={searchTerm}
                            onChange={handleSearchChange}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="搜索..."
                            className="bg-gray-50/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 text-sm rounded-full pl-10 pr-4 py-1.5 w-64 focus:ring-2 focus:ring-cream-500/20 focus:border-cream-500 outline-none transition-all placeholder:text-gray-400"
                        />
                    </div>

                    <div className="h-6 w-px bg-gray-200 dark:bg-gray-800 mx-1" />

                    <button
                        onClick={toggleTheme}
                        className="p-2 text-gray-400 hover:text-cream-600 hover:bg-cream-50 dark:hover:bg-cream-900/10 rounded-full transition-all"
                        title="切换主题"
                    >
                        {settings.theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                    </button>

                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-cream-400 to-orange-400 p-0.5 ml-2 cursor-pointer hover:ring-2 ring-cream-200 dark:ring-gray-800 transition-all">
                        <div className="w-full h-full rounded-full bg-white dark:bg-gray-900 flex items-center justify-center text-xs font-bold text-cream-600">
                            A
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};
