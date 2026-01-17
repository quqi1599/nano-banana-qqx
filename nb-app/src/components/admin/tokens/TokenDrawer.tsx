import React, { useState } from 'react';
import { X } from 'lucide-react';

export interface NewTokenForm {
    name: string;
    apiKey: string;
    baseUrl: string;
    priority: number;
}

interface TokenDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: NewTokenForm) => Promise<void>;
    addingToken: boolean;
    apiBaseUrl: string;
}

export const TokenDrawer: React.FC<TokenDrawerProps> = ({
    isOpen,
    onClose,
    onSubmit,
    addingToken,
    apiBaseUrl,
}) => {
    const [name, setName] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [priority, setPriority] = useState(0);

    React.useEffect(() => {
        if (!isOpen) {
            setName('');
            setApiKey('');
            setPriority(0);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({ name, apiKey, baseUrl: apiBaseUrl, priority });
    };

    return (
        <div className="fixed inset-0 z-[100]">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg sm:text-xl font-bold">新建 Token</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition">
                        <X size={20} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
                    <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Token 名称</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.currentTarget.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-cream-500 outline-none transition"
                            placeholder="e.g. My Token"
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">API 密钥</label>
                        <input
                            value={apiKey}
                            onChange={(e) => setApiKey(e.currentTarget.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 font-mono text-sm focus:ring-2 focus:ring-cream-500 outline-none transition"
                            placeholder="sk-..."
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">优先级</label>
                        <input
                            type="number"
                            value={priority}
                            onChange={(e) => setPriority(Number(e.currentTarget.value))}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-cream-500 outline-none transition"
                            min="0"
                            max="100"
                        />
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                            数值越大优先级越高，默认为 0
                        </p>
                    </div>
                </form>
                <div className="px-4 sm:px-6 py-4 border-t border-gray-100 dark:border-gray-800 pb-safe">
                    <button
                        onClick={() => document.querySelector('form')?.requestSubmit()}
                        disabled={addingToken || !name || !apiKey}
                        className="w-full py-3 bg-cream-600 text-white rounded-xl hover:bg-cream-700 active:bg-cream-800 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {addingToken ? '创建中...' : '创建 Token'}
                    </button>
                </div>
            </div>
        </div>
    );
};
