import React from 'react';

interface PaginationProps {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
    page,
    pageSize,
    total,
    onPageChange,
    className,
}) => {
    if (!total || total <= pageSize) return null;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const canPrev = page > 1;
    const canNext = page < totalPages;

    return (
        <div className={`flex items-center justify-between gap-2 ${className || ''}`}>
            <span className="text-xs text-gray-500 dark:text-gray-400">共 {total} 条</span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onPageChange(page - 1)}
                    disabled={!canPrev}
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    上一页
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {page}/{totalPages}
                </span>
                <button
                    type="button"
                    onClick={() => onPageChange(page + 1)}
                    disabled={!canNext}
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    下一页
                </button>
            </div>
        </div>
    );
};
