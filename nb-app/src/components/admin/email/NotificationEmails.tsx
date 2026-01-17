/**
 * 通知邮箱管理组件
 * 管理接收工单通知的邮箱列表
 */
import { useState, useEffect } from 'react';
import {
    Bell,
    Mail,
    Plus,
    Trash2,
    Power,
    PowerOff,
    Loader2,
    X,
} from 'lucide-react';
import {
    getNotificationEmails,
    addNotificationEmail,
    deleteNotificationEmail,
    toggleNotificationEmail,
    type NotificationEmailInfo,
} from '../../../services/adminService';

export const NotificationEmails: React.FC = () => {
    const [emails, setEmails] = useState<NotificationEmailInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newRemark, setNewRemark] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getNotificationEmails();
            setEmails(data);
        } catch (err) {
            console.error('Failed to load notification emails:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newEmail.trim()) {
            setError('请输入邮箱地址');
            return;
        }

        // 简单的邮箱格式验证
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail.trim())) {
            setError('请输入有效的邮箱地址');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            await addNotificationEmail(newEmail.trim(), newRemark.trim() || undefined);
            setNewEmail('');
            setNewRemark('');
            setShowAddForm(false);
            loadData();
        } catch (err: any) {
            setError(err.message || '添加失败');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除此通知邮箱吗？')) return;
        try {
            await deleteNotificationEmail(id);
            loadData();
        } catch (err: any) {
            alert(err.message || '删除失败');
        }
    };

    const handleToggle = async (id: string) => {
        try {
            await toggleNotificationEmail(id);
            loadData();
        } catch (err: any) {
            alert(err.message || '操作失败');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* 头部说明 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-5 border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        <Bell size={20} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">工单通知邮箱</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            当用户提交新工单时，系统会自动发送通知邮件到以下邮箱。邮件包含客户邮箱、积分余额及工单详情。
                        </p>
                    </div>
                </div>
            </div>

            {/* 添加按钮 */}
            <div className="flex justify-end">
                <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-medium hover:from-brand-600 hover:to-brand-700 transition-all flex items-center gap-2 shadow-lg shadow-brand-500/30"
                >
                    <Plus size={18} />
                    添加邮箱
                </button>
            </div>

            {/* 添加表单 */}
            {showAddForm && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-gray-900 dark:text-white">添加通知邮箱</h4>
                        <button
                            onClick={() => {
                                setShowAddForm(false);
                                setNewEmail('');
                                setNewRemark('');
                                setError('');
                            }}
                            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            <X size={18} className="text-gray-400" />
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                邮箱地址 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.currentTarget.value)}
                                placeholder="admin@example.com"
                                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                备注（可选）
                            </label>
                            <input
                                type="text"
                                value={newRemark}
                                onChange={(e) => setNewRemark(e.currentTarget.value)}
                                placeholder="如：运营负责人"
                                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-red-500">{error}</p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowAddForm(false);
                                    setNewEmail('');
                                    setNewRemark('');
                                    setError('');
                                }}
                                className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={submitting}
                                className="px-4 py-2 rounded-xl bg-brand-500 text-white font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
                            >
                                {submitting && <Loader2 size={16} className="animate-spin" />}
                                添加
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 邮箱列表 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                        通知邮箱列表
                        <span className="ml-2 text-sm font-normal text-gray-500">
                            ({emails.filter(e => e.is_active).length} 个启用)
                        </span>
                    </h3>
                </div>
                {emails.length === 0 ? (
                    <div className="p-12 text-center">
                        <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                        <p className="text-gray-500">暂无通知邮箱</p>
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="mt-4 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors"
                        >
                            添加第一个邮箱
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        邮箱
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        备注
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        状态
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {emails.map((email) => (
                                    <tr
                                        key={email.id}
                                        className={`transition-colors ${!email.is_active ? 'opacity-60 bg-gray-50 dark:bg-gray-800/30' : ''}`}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <Mail size={16} className="text-gray-400" />
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {email.email}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm text-gray-500">
                                                {email.remark || '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {email.is_active ? (
                                                <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full">
                                                    已启用
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full">
                                                    已禁用
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleToggle(email.id)}
                                                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                    title={email.is_active ? '禁用' : '启用'}
                                                >
                                                    {email.is_active ? (
                                                        <PowerOff size={16} className="text-green-500" />
                                                    ) : (
                                                        <Power size={16} className="text-gray-400" />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(email.id)}
                                                    className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                                                    title="删除"
                                                >
                                                    <Trash2 size={16} className="text-gray-400 hover:text-red-500" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
