/**
 * 登录/注册弹窗组件
 */
import React, { useState } from 'react';
import { X, Mail, Lock, User, Loader2, Gift } from 'lucide-react';
import { login, register, redeemCode } from '../services/authService';
import { useAuthStore } from '../store/useAuthStore';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type TabType = 'login' | 'register' | 'redeem';

export const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
    const [activeTab, setActiveTab] = useState<TabType>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [redeemCodeInput, setRedeemCodeInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const { login: storeLogin, isAuthenticated, user, refreshCredits } = useAuthStore();

    if (!isOpen) return null;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const { access_token, user } = await login(email, password);
            storeLogin(access_token, user);
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const { access_token, user } = await register(email, password);
            storeLogin(access_token, user);
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRedeem = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            const result = await redeemCode(redeemCodeInput);
            setSuccess(`兑换成功！获得 ${result.credits_added} 积分，当前余额 ${result.new_balance} 积分`);
            setRedeemCodeInput('');
            refreshCredits();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {isAuthenticated ? '账户中心' : activeTab === 'login' ? '登录' : activeTab === 'register' ? '注册' : '兑换码'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {isAuthenticated && user ? (
                        // 已登录 - 显示用户信息和兑换码
                        <div className="space-y-4">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <User className="w-8 h-8 text-white" />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                    {user.nickname || user.email}
                                </h3>
                                <p className="text-sm text-gray-500">{user.email}</p>
                            </div>

                            <div className="bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 rounded-xl p-4 text-center">
                                <p className="text-sm text-amber-700 dark:text-amber-300">当前积分余额</p>
                                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                                    {user.credit_balance}
                                </p>
                            </div>

                            {/* 兑换码 */}
                            <form onSubmit={handleRedeem} className="space-y-3">
                                <div className="relative">
                                    <Gift className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={redeemCodeInput}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedeemCodeInput(e.currentTarget.value.toUpperCase())}
                                        placeholder="输入兑换码"
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isLoading || !redeemCodeInput.trim()}
                                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
                                    兑换积分
                                </button>
                            </form>

                            {error && (
                                <p className="text-sm text-red-500 text-center">{error}</p>
                            )}
                            {success && (
                                <p className="text-sm text-green-500 text-center">{success}</p>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Tabs */}
                            <div className="flex gap-2 mb-6">
                                <button
                                    onClick={() => { setActiveTab('login'); setError(''); }}
                                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${activeTab === 'login'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    登录
                                </button>
                                <button
                                    onClick={() => { setActiveTab('register'); setError(''); }}
                                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${activeTab === 'register'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    注册
                                </button>
                            </div>

                            {/* Form */}
                            <form onSubmit={activeTab === 'login' ? handleLogin : handleRegister} className="space-y-4">
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.currentTarget.value)}
                                        placeholder="邮箱地址"
                                        required
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.currentTarget.value)}
                                        placeholder="密码"
                                        required
                                        minLength={6}
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                {error && (
                                    <p className="text-sm text-red-500 text-center">{error}</p>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                                    {activeTab === 'login' ? '登录' : '注册'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
