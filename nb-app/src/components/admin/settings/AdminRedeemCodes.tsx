import React, { useState, useEffect } from 'react';
import { Gift, Check, Copy, Loader2 } from 'lucide-react';
import { generateRedeemCodes, getRedeemCodes, RedeemCodeInfo } from '../../../services/adminService';

export const AdminRedeemCodes = () => {
    const [codes, setCodes] = useState<RedeemCodeInfo[]>([]);
    const [generateCount, setGenerateCount] = useState(10);
    const [generateAmount, setGenerateAmount] = useState(100);
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
    const [copiedCodes, setCopiedCodes] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getRedeemCodes();
            setCodes(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleGenerateCodes = async () => {
        setLoading(true);
        try {
            const result = await generateRedeemCodes(generateCount, generateAmount, 0, 0);
            setGeneratedCodes(result.codes);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyCodes = () => {
        navigator.clipboard.writeText(generatedCodes.join('\n'));
        setCopiedCodes(true);
        setTimeout(() => setCopiedCodes(false), 2000);
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
                    <Gift className="w-5 h-5" />
                    Generate Redeem Codes
                </h4>
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold text-gray-500 mb-2">Quantity</label>
                        <input
                            type="number"
                            value={generateCount}
                            onChange={(e) => setGenerateCount(Number(e.currentTarget.value))}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-cream-500 outline-none"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold text-gray-500 mb-2">Value (Credits)</label>
                        <input
                            type="number"
                            value={generateAmount}
                            onChange={(e) => setGenerateAmount(Number(e.currentTarget.value))}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-cream-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={handleGenerateCodes}
                        disabled={loading}
                        className="px-8 py-3 bg-cream-600 text-white rounded-xl hover:bg-cream-700 transition font-bold shadow-lg shadow-cream-500/20 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Generate'}
                    </button>
                </div>
            </div>

            {generatedCodes.length > 0 && (
                <div className="p-6 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-2xl animate-fade-in-up">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
                            <Check className="w-5 h-5" />
                            Successfully Generated {generatedCodes.length} Codes
                        </h4>
                        <button
                            onClick={handleCopyCodes}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-green-200 dark:border-green-800 text-green-700 rounded-xl hover:bg-green-50 transition"
                        >
                            {copiedCodes ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copiedCodes ? 'Copied' : 'Copy All'}
                        </button>
                    </div>
                    <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-green-100 dark:border-green-900/30 grid grid-cols-2 lg:grid-cols-4 gap-2 font-mono text-sm max-h-60 overflow-auto">
                        {generatedCodes.map(code => (
                            <div key={code} className="p-2 text-center text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded">
                                {code}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* List existing codes if needed, or just show generator. Previous code didn't list them explicitly? 
                Ah, `codes` state was fetched but not rendered in the previous dashboard code!
                Wait, searching Step 605/609 content for `activeTab === 'codes'`.
                Lines 834-894.
                It ONLY shows the generator and the generated codes. It does NOT list the existing codes.
                So `codes` state was fetching `getRedeemCodes()` but unused in render?
                Let's check `AdminDashboard.tsx` render in Step 609 again.
                Yes, `codes` is used in `loadData`, but in the render block (834-894), `codes` variable is NOT used.
                So I will stick to what was there: Generator only.
            */}
        </div>
    );
};
