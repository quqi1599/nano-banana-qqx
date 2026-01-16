import React from 'react';
import { User, Bot } from 'lucide-react';
import { AdminUserType } from '../../../../../services/conversationService';

export const USER_TYPE_META: Record<AdminUserType, { label: string; badge: string }> = {
    user: {
        label: '登录用户',
        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
    },
    api_key: {
        label: 'API 用户',
        badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200',
    },
    visitor: {
        label: '游客',
        badge: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
    },
};

export const UserTypeBadge: React.FC<{ type: AdminUserType }> = ({ type }) => (
    <span className={`text-[10px] font-semibold rounded-full px-2.5 py-0.5 uppercase tracking-wide ${USER_TYPE_META[type]?.badge || ''}`}>
        {USER_TYPE_META[type]?.label || type}
    </span>
);

export const getInputValue = (e: Event): string => (e.target as HTMLInputElement).value;
