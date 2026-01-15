import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    label: string;
    value: number | string;
    suffix?: string;
    icon: LucideIcon;
    color: 'amber' | 'orange' | 'blue' | 'green' | 'purple' | 'rose';
    trend?: {
        value: number;
        label: string;
    };
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, suffix, icon: Icon, color, trend }) => {
    const colorStyles = {
        amber: 'bg-amber-100/50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
        orange: 'bg-orange-100/50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
        blue: 'bg-blue-100/50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
        green: 'bg-green-100/50 text-green-600 dark:bg-green-500/10 dark:text-green-400',
        purple: 'bg-purple-100/50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
        rose: 'bg-rose-100/50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-cream-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
                    <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                            {typeof value === 'number' ? value.toLocaleString() : value}
                        </span>
                        {suffix && <span className="text-xs font-medium text-gray-400">{suffix}</span>}
                    </div>
                </div>
                <div className={`p-3 rounded-xl ${colorStyles[color]} transition-transform group-hover:scale-110 duration-300`}>
                    <Icon size={20} />
                </div>
            </div>
            {trend && (
                <div className="mt-4 flex items-center gap-2 text-xs">
                    <span className={`font-medium ${trend.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {trend.value > 0 ? '+' : ''}{trend.value}%
                    </span>
                    <span className="text-gray-400">{trend.label}</span>
                </div>
            )}
        </div>
    );
};
