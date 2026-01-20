import React from 'react';
import { X, Calendar } from 'lucide-react';
import { ConversationFilters } from '../../../services/conversationService';
import { getInputValue } from './utils/constants';

interface FiltersPanelProps {
    filters: ConversationFilters;
    updateFilter: (key: keyof ConversationFilters, value: any) => void;
    clearFilters: () => void;
    onClose: () => void;
    searchQuery: string;
}

export const FiltersPanel: React.FC<FiltersPanelProps> = ({
    filters,
    updateFilter,
    clearFilters,
    onClose,
    searchQuery,
}) => {
    return (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-700 dark:text-gray-300">高级筛选</h3>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-600 transition"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 模型筛选 */}
                <select
                    value={filters.model_name ?? ''}
                    onChange={(e) => updateFilter('model_name', getInputValue(e) || undefined)}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                >
                    <option value="">全部模型</option>
                    <option value="gemini-3-pro-image-preview">Banana Pro (3.0模型)</option>
                    <option value="gemini-2.5-flash-image-preview">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-image">Banana (2.5模型)</option>
                </select>

                {/* 消息数量范围 */}
                <input
                    type="number"
                    placeholder="最少消息数"
                    value={filters.min_messages ?? ''}
                    onChange={(e) => updateFilter('min_messages', getInputValue(e) ? Number(getInputValue(e)) : undefined)}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                    type="number"
                    placeholder="最多消息数"
                    value={filters.max_messages ?? ''}
                    onChange={(e) => updateFilter('max_messages', getInputValue(e) ? Number(getInputValue(e)) : undefined)}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />

                {/* 时间范围 */}
                <input
                    type="date"
                    value={filters.date_from ?? ''}
                    onChange={(e) => updateFilter('date_from', getInputValue(e) || undefined)}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
            </div>

            <div className="flex justify-end">
                <button
                    onClick={clearFilters}
                    className="text-sm text-cream-600 hover:text-brand-700 flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                    <X className="w-3 h-3" />
                    清空筛选
                </button>
            </div>
        </div>
    );
};
