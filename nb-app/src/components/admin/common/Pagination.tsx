import React from 'react';

interface PaginationProps {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    itemLabel?: string; // 如 "对话"、"游客" 等
    className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
    page,
    pageSize,
    total,
    onPageChange,
    itemLabel = '条',
    className = ''
}) => {
    const totalPages = Math.ceil(total / pageSize);
    const hasPagination = total > pageSize;

    if (!hasPagination) return null;

    return (
        <div className={`px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between ${className}`}>
            <div className="text-sm text-gray-500">
                共 {total} 个{itemLabel}，第 {page} / {totalPages} 页
            </div>
            <div className="flex gap-2">
                <button
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                    上一页
                </button>
                <button
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                    下一页
                </button>
            </div>
        </div>
    );
};
