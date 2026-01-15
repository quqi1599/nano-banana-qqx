import React, { useState, useEffect } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { getModelPricing, createModelPricing, updateModelPricing, ModelPricingInfo } from '../../../services/adminService';

export const AdminPricing = () => {
    const [pricing, setPricing] = useState<ModelPricingInfo[]>([]);
    const [pricingDrafts, setPricingDrafts] = useState<Record<string, number>>({});
    const [newModelName, setNewModelName] = useState('');
    const [newModelCredits, setNewModelCredits] = useState(10);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-sm flex items-center gap-3">
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></span>
                    {error}
                </div>
            )}

            <div className="bg-gradient-to-br from-cream-50 to-white dark:from-gray-900 dark:to-gray-800 p-6 rounded-2xl border border-cream-100 dark:border-gray-800 shadow-sm">
                <h4 className="font-bold text-cream-800 dark:text-cream-400 mb-4 flex items-center gap-2">
                    <Coins className="w-5 h-5" />
                    Add Model Pricing
                </h4>
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.currentTarget.value)}
                        placeholder="Model Name (e.g. gemini-pro)"
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-cream-500 outline-none transition"
                    />
                    <input
                        type="number"
                        min="1"
                        value={newModelCredits}
                        onChange={(e) => setNewModelCredits(Number(e.currentTarget.value))}
                        placeholder="Credits"
                        className="w-full sm:w-32 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-center focus:ring-2 focus:ring-cream-500 outline-none transition"
                    />
                    <button
                        onClick={handleAddPricing}
                        disabled={!newModelName.trim() || newModelCredits <= 0}
                        className="px-6 py-3 bg-cream-600 text-white rounded-xl hover:bg-cream-700 disabled:opacity-50 transition font-bold shadow-lg shadow-cream-500/20"
                    >
                        Add
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pricing.map(item => (
                    <div key={item.id} className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
                        <div className="font-bold text-gray-900 dark:text-white mb-2">{item.model_name}</div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                                <input
                                    type="number"
                                    value={pricingDrafts[item.id] ?? item.credits_per_request}
                                    onChange={(e) => setPricingDrafts(prev => ({ ...prev, [item.id]: Number(e.currentTarget.value) }))}
                                    className="w-16 bg-transparent text-center font-mono text-sm outline-none"
                                />
                                <span className="text-xs text-gray-400">credits</span>
                            </div>
                            <button
                                onClick={() => handleUpdatePricing(item.id)}
                                className="text-xs font-bold text-cream-600 hover:bg-cream-50 px-3 py-2 rounded-lg transition"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {loading && <div className="text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}
        </div>
    );
};
