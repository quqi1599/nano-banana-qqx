import React, { useState, useEffect } from 'react';
import { Coins } from 'lucide-react';
import { getModelPricing, createModelPricing, updateModelPricing, ModelPricingInfo } from '../../../services/adminService';
import { ErrorAlert, InlineLoading } from '../common';

// 模型名称友好显示映射
const MODEL_NAME_MAP: Record<string, string> = {
    'gemini-3-pro-image-preview': 'Banana Pro (3.0模型)',
    'gemini-2.5-flash-image': 'Banana (2.5模型)',
    'gemini-2.5-flash-image-preview': 'Gemini 2.5 Flash Image Preview',
};

// 快速选择常用模型
const QUICK_MODELS = [
    { name: 'gemini-3-pro-image-preview', label: 'Banana Pro (3.0模型)' },
    { name: 'gemini-2.5-flash-image', label: 'Banana (2.5模型)' },
];

export const AdminPricing = () => {
    const [pricing, setPricing] = useState<ModelPricingInfo[]>([]);
    const [pricingDrafts, setPricingDrafts] = useState<Record<string, number>>({});
    const [newModelName, setNewModelName] = useState('');
    const [newModelCredits, setNewModelCredits] = useState(10);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // 获取友好的模型显示名称
    const getDisplayName = (modelName: string): string => {
        return MODEL_NAME_MAP[modelName] || modelName;
    };

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getModelPricing();
            setPricing(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const nextDrafts: Record<string, number> = {};
        pricing.forEach((item) => {
            nextDrafts[item.id] = item.credits_per_request;
        });
        setPricingDrafts(nextDrafts);
    }, [pricing]);

    const handleAddPricing = async () => {
        if (!newModelName.trim() || newModelCredits <= 0) return;
        try {
            await createModelPricing(newModelName.trim(), newModelCredits);
            setNewModelName('');
            setNewModelCredits(10);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleUpdatePricing = async (id: string) => {
        const nextValue = pricingDrafts[id];
        if (!nextValue || nextValue <= 0) {
            setError('扣点次数必须大于 0');
            return;
        }
        try {
            await updateModelPricing(id, nextValue);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <ErrorAlert message={error} onDismiss={() => setError('')} />

            <div className="bg-gradient-to-br from-cream-50 to-white dark:from-gray-900 dark:to-gray-800 p-6 rounded-2xl border border-cream-100 dark:border-gray-800 shadow-sm">
                <h4 className="font-bold text-cream-800 dark:text-cream-400 mb-4 flex items-center gap-2">
                    <Coins className="w-5 h-5" />
                    添加模型定价
                </h4>

                {/* 快速选择常用模型 */}
                <div className="mb-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">快速添加常用模型：</div>
                    <div className="flex flex-wrap gap-2">
                        {QUICK_MODELS.map(model => (
                            <button
                                key={model.name}
                                onClick={() => setNewModelName(model.name)}
                                className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-cream-500 hover:bg-cream-50 dark:hover:bg-cream-500/10 transition"
                            >
                                {model.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.currentTarget.value)}
                        placeholder="模型名称 (如 gemini-3-pro-image-preview)"
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-cream-500 outline-none transition"
                    />
                    <input
                        type="number"
                        min="1"
                        value={newModelCredits}
                        onChange={(e) => setNewModelCredits(Number(e.currentTarget.value))}
                        placeholder="积分消耗"
                        className="w-full sm:w-32 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-center focus:ring-2 focus:ring-cream-500 outline-none transition"
                    />
                    <button
                        onClick={handleAddPricing}
                        disabled={!newModelName.trim() || newModelCredits <= 0}
                        className="px-6 py-3 bg-cream-600 text-white rounded-xl hover:bg-cream-700 disabled:opacity-50 transition font-bold shadow-lg shadow-cream-500/20"
                    >
                        添加
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pricing.map(item => (
                    <div key={item.id} className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
                        <div className="font-bold text-gray-900 dark:text-white mb-1">{getDisplayName(item.model_name)}</div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-3 font-mono truncate">{item.model_name}</div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                                <input
                                    type="number"
                                    value={pricingDrafts[item.id] ?? item.credits_per_request}
                                    onChange={(e) => setPricingDrafts(prev => ({ ...prev, [item.id]: Number(e.currentTarget.value) }))}
                                    className="w-16 bg-transparent text-center font-mono text-sm outline-none"
                                />
                                <span className="text-xs text-gray-400">积分</span>
                            </div>
                            <button
                                onClick={() => handleUpdatePricing(item.id)}
                                className="text-xs font-bold text-cream-600 hover:bg-cream-50 px-3 py-2 rounded-lg transition"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {loading && <InlineLoading className="text-center text-gray-500" />}
        </div>
    );
};
