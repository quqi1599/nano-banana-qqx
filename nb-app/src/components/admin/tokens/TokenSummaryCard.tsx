import React from 'react';

interface TokenSummaryCardProps {
    label: string;
    value: number;
    tone: 'neutral' | 'ok' | 'warn' | 'low';
    helper?: string;
}

export const TokenSummaryCard = ({ label, value, tone, helper }: TokenSummaryCardProps) => {
    const toneMap = {
        neutral: 'bg-gray-400',
        ok: 'bg-green-500',
        warn: 'bg-amber-500',
        low: 'bg-orange-500',
    };

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className={`h-2 w-2 rounded-full ${toneMap[tone]}`} />
                <span>{label}</span>
            </div>
            <div className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {value.toLocaleString()}
            </div>
            {helper && (
                <div className="text-[10px] text-gray-400 mt-1">{helper}</div>
            )}
        </div>
    );
};
