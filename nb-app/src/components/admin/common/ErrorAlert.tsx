import React from 'react';
import { X } from 'lucide-react';

interface ErrorAlertProps {
    message: string;
    onDismiss?: () => void;
    className?: string;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, onDismiss, className = '' }) => {
    if (!message) return null;

    return (
        <div className={`p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3 ${className}`}>
            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></span>
            <span className="flex-1">{message}</span>
            {onDismiss && (
                <button
                    onClick={onDismiss}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
                    aria-label="关闭"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};
