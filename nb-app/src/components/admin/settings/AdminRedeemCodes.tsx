import React, { useState, useEffect } from 'react';
import { Gift, Check, Copy, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { generateRedeemCodes, getRedeemCodes, deleteRedeemCode, deleteUsedRedeemCodes, deleteUnusedRedeemCodes, RedeemCodeInfo } from '../../../services/adminService';
import { ErrorAlert } from '../common';
import { formatDate } from '../../../utils/formatters';

export const AdminRedeemCodes = () => {
    const [codes, setCodes] = useState<RedeemCodeInfo[]>([]);
    const [generateCount, setGenerateCount] = useState(10);
    const [generateAmount, setGenerateAmount] = useState(100);
    const [generateRemark, setGenerateRemark] = useState('');
    const [generateExpiresDays, setGenerateExpiresDays] = useState<number | ''>('');
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
    const [copiedCodes, setCopiedCodes] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [deleteDialog, setDeleteDialog] = useState<{
        type: 'single' | 'used' | 'unused';
        codeId?: string;
        code?: string;
    } | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // 统计数据
    const stats = {
        total: codes.length,
        used: codes.filter(c => c.is_used).length,
        unused: codes.filter(c => !c.is_used).length,
    };

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
            const expiresDays = typeof generateExpiresDays === 'number' && generateExpiresDays > 0
                ? generateExpiresDays
                : undefined;
            const remark = generateRemark.trim() ? generateRemark.trim() : undefined;
            const result = await generateRedeemCodes(generateCount, generateAmount, 0, 0, expiresDays, remark);
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

    const handleCopyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const handleDeleteCode = async (codeId: string) => {
        setDeleteLoading(true);
        try {
            await deleteRedeemCode(codeId);
            setDeleteDialog(null);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleDeleteUsed = async () => {
        setDeleteLoading(true);
        try {
            const result = await deleteUsedRedeemCodes();
            setDeleteDialog(null);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleDeleteUnused = async () => {
        setDeleteLoading(true);
        try {
            const result = await deleteUnusedRedeemCodes();
            setDeleteDialog(null);
            loadData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <ErrorAlert message={error} onDismiss={() => setError('')} />

            <div className="bg-gradient-to-br from-cream-50 to-white dark:from-gray-900 dark:to-gray-800 p-6 rounded-2xl border border-cream-100 dark:border-gray-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-cream-800 dark:text-cream-400 flex items-center gap-2">
                        <Gift className="w-5 h-5" />
                        生成兑换码
                    </h4>
                    <span className="text-xs text-cream-700/70 dark:text-cream-200/60">一码一次 · 永久积分</span>
                </div>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2">数量</label>
                            <input
                                type="number"
                                min="1"
                                value={generateCount}
                                onChange={(e) => setGenerateCount(Number(e.currentTarget.value))}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2">积分值</label>
                            <input
                                type="number"
                                min="1"
                                value={generateAmount}
                                onChange={(e) => setGenerateAmount(Number(e.currentTarget.value))}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2">有效期 (天)</label>
                            <input
                                type="number"
                                min="0"
                                value={generateExpiresDays}
                                onChange={(e) => {
                                    const next = e.currentTarget.value;
                                    setGenerateExpiresDays(next === '' ? '' : Number(next));
                                }}
                                placeholder="留空/0 为永久"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 mb-2">备注</label>
                            <input
                                type="text"
                                value={generateRemark}
                                onChange={(e) => setGenerateRemark(e.currentTarget.value)}
                                placeholder="如：活动赠送 / 渠道合作"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={handleGenerateCodes}
                            disabled={loading}
                            className="px-8 py-3 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition font-bold shadow-lg shadow-brand-500/20 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '生成'}
                        </button>
                    </div>
                </div>
            </div>

            {generatedCodes.length > 0 && (
                <div className="p-6 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-2xl animate-fade-in-up">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
                            <Check className="w-5 h-5" />
                            成功生成 {generatedCodes.length} 个兑换码
                        </h4>
                        <button
                            onClick={handleCopyCodes}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-green-200 dark:border-green-800 text-green-700 rounded-xl hover:bg-green-50 transition"
                        >
                            {copiedCodes ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copiedCodes ? '已复制' : '复制全部'}
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

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <h4 className="font-bold text-gray-900 dark:text-white">最近兑换码</h4>
                        <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">总计: <span className="font-semibold text-gray-700 dark:text-gray-300">{stats.total}</span></span>
                            <span className="text-gray-500">已使用: <span className="font-semibold text-red-500">{stats.used}</span></span>
                            <span className="text-gray-500">未使用: <span className="font-semibold text-green-500">{stats.unused}</span></span>
                        </div>
                    </div>
                    <button
                        onClick={loadData}
                        className="text-xs font-semibold text-cream-600 hover:text-brand-700"
                    >
                        刷新
                    </button>
                </div>

                {/* 批量删除按钮 */}
                {(stats.used > 0 || stats.unused > 0) && (
                    <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                        <span className="text-xs text-gray-500">批量操作:</span>
                        {stats.used > 0 && (
                            <button
                                onClick={() => setDeleteDialog({ type: 'used' })}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                删除已使用 ({stats.used})
                            </button>
                        )}
                        {stats.unused > 0 && (
                            <button
                                onClick={() => setDeleteDialog({ type: 'unused' })}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                删除未使用 ({stats.unused})
                            </button>
                        )}
                    </div>
                )}
                <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                    {codes.length === 0 ? (
                        <div className="text-sm text-gray-400 py-8 text-center">暂无兑换码记录</div>
                    ) : (
                        codes.map((code) => (
                            <div
                                key={code.id}
                                className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-center rounded-xl border border-gray-100 dark:border-gray-800 p-3 hover:border-cream-200 dark:hover:border-cream-800 transition"
                            >
                                <div className="sm:col-span-2">
                                    <div className="text-xs text-gray-400 mb-1">兑换码</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-white">{code.code}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400 mb-1">积分</div>
                                    <div className="font-semibold text-cream-600">{code.credit_amount}</div>
                                </div>
                                <div className="sm:col-span-2">
                                    <div className="text-xs text-gray-400 mb-1">备注</div>
                                    <div className="text-sm text-gray-600 dark:text-gray-300 truncate">{code.remark || '—'}</div>
                                </div>
                                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:gap-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        code.is_used
                                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                                            : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300'
                                    }`}>
                                        {code.is_used ? '已使用' : '未使用'}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleCopyCode(code.code)}
                                            className="text-xs text-gray-400 hover:text-cream-600 flex items-center gap-1"
                                        >
                                            {copiedCode === code.code ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                            {copiedCode === code.code ? '已复制' : '复制'}
                                        </button>
                                        <button
                                            onClick={() => setDeleteDialog({ type: 'single', codeId: code.id, code: code.code })}
                                            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                                            title="删除"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                                <div className="sm:col-span-6 text-xs text-gray-400 flex flex-wrap gap-3">
                                    <span>创建 {formatDate(code.created_at)}</span>
                                    {code.used_at && <span>使用 {formatDate(code.used_at)}</span>}
                                    {code.expires_at && <span>到期 {formatDate(code.expires_at)}</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 删除确认对话框 */}
            {deleteDialog && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-in-up">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                            </div>
                            <h3 className="font-bold text-gray-900 dark:text-white">确认删除</h3>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            {deleteDialog.type === 'single' && (
                                <>确定要删除兑换码 <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{deleteDialog.code}</span> 吗？此操作不可恢复。</>
                            )}
                            {deleteDialog.type === 'used' && (
                                <>确定要删除所有 <span className="font-semibold text-red-500">{stats.used}</span> 个已使用的兑换码吗？此操作不可恢复。</>
                            )}
                            {deleteDialog.type === 'unused' && (
                                <>确定要删除所有 <span className="font-semibold text-orange-500">{stats.unused}</span> 个未使用的兑换码吗？此操作不可恢复。</>
                            )}
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteDialog(null)}
                                disabled={deleteLoading}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => {
                                    if (deleteDialog.type === 'single') {
                                        handleDeleteCode(deleteDialog.codeId!);
                                    } else if (deleteDialog.type === 'used') {
                                        handleDeleteUsed();
                                    } else if (deleteDialog.type === 'unused') {
                                        handleDeleteUnused();
                                    }
                                }}
                                disabled={deleteLoading}
                                className="px-4 py-2 text-sm font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 transition flex items-center gap-2 disabled:opacity-50"
                            >
                                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                {deleteLoading ? '删除中...' : '确认删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
