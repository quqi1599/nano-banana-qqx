import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
    message?: string;
    className?: string;
    iconClassName?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
    message = '加载中...',
    className = '',
    iconClassName = 'w-8 h-8'
}) => {
    return (
        <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
            <Loader2 className={`${iconClassName} animate-spin text-brand-500 mb-2`} />
            <p className="text-gray-500 text-sm">{message}</p>
        </div>
    );
};

interface InlineLoadingProps {
    className?: string;
    iconClassName?: string;
}

export const InlineLoading: React.FC<InlineLoadingProps> = ({
    className = '',
    iconClassName = 'w-5 h-5'
}) => {
    return (
        <div className={`flex items-center justify-center ${className}`}>
            <Loader2 className={`${iconClassName} animate-spin text-brand-500`} />
        </div>
    );
};
