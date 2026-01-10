/**
 * 登录/注册弹窗组件
 */
import React, { useEffect, useRef, useState } from 'react';
import { X, Mail, Lock, User, Loader2, Gift, Eye, EyeOff } from 'lucide-react';
import { login, register, redeemCode, resetPassword, sendCode } from '../services/authService';
import { useAuthStore } from '../store/useAuthStore';
import { SliderCaptcha } from './SliderCaptcha';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type TabType = 'login' | 'register' | 'redeem' | 'reset';
type CaptchaPurpose = 'login' | 'register' | 'reset';

export const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
    const [activeTab, setActiveTab] = useState<TabType>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [redeemCodeInput, setRedeemCodeInput] = useState('');
    const [registerCode, setRegisterCode] = useState('');
    const [registerCodeSending, setRegisterCodeSending] = useState(false);
    const [registerCodeCooldown, setRegisterCodeCooldown] = useState(0);
    const [resetEmail, setResetEmail] = useState('');
    const [resetCode, setResetCode] = useState('');
    const [resetNewPassword, setResetNewPassword] = useState('');
    const [codeSending, setCodeSending] = useState(false);
    const [codeCooldown, setCodeCooldown] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Captcha state
    const [showCaptcha, setShowCaptcha] = useState(false);
    const [captchaPurpose, setCaptchaPurpose] = useState<CaptchaPurpose | null>(null);
    const pendingCaptchaActionRef = useRef<null | ((ticket: string) => Promise<void>)>(null);

    const { login: storeLogin, isAuthenticated, user, refreshCredits } = useAuthStore();

    if (!isOpen) return null;

    const openCaptcha = (purpose: CaptchaPurpose, action: (ticket: string) => Promise<void>) => {
        pendingCaptchaActionRef.current = action;
        setCaptchaPurpose(purpose);
        setShowCaptcha(true);
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        openCaptcha('login', async (ticket) => {
            setIsLoading(true);
            try {
                const { access_token, user } = await login(email, password, ticket);
                storeLogin(access_token, user);
                onClose();
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setIsLoading(false);
            }
        });
    };

    const handleRegister = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!registerCode.trim()) {
            setError('请输入验证码');
            return;
        }
        if (password.length < 6) {
            setError('密码长度至少6位');
            return;
        }
        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        openCaptcha('register', async (ticket) => {
            setIsLoading(true);
            try {
                const { access_token, user } = await register(
                    email,
                    password,
                    undefined,
                    registerCode.trim(),
                    ticket
                );
                storeLogin(access_token, user);
                onClose();
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setIsLoading(false);
            }
        });
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

    useEffect(() => {
        if (codeCooldown <= 0) return;
        const timer = window.setInterval(() => {
            setCodeCooldown((current) => (current > 1 ? current - 1 : 0));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [codeCooldown]);

    useEffect(() => {
        if (registerCodeCooldown <= 0) return;
        const timer = window.setInterval(() => {
            setRegisterCodeCooldown((current) => (current > 1 ? current - 1 : 0));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [registerCodeCooldown]);

    const initiateRegisterCode = () => {
        if (!email.trim()) {
            setError('请输入邮箱地址');
            return;
        }
        if (registerCodeCooldown > 0 || registerCodeSending) return;
        setError('');
        setSuccess('');
        sendRegisterCode();
    };

    const initiateResetCode = () => {
        if (!resetEmail.trim()) {
            setError('请输入邮箱地址');
            return;
        }
        if (codeCooldown > 0 || codeSending) return;
        setError('');
        setSuccess('');
        sendResetCode();
    };

    const sendRegisterCode = async () => {
        setRegisterCodeSending(true);
        try {
            await sendCode(email.trim(), 'register');
            setSuccess('验证码已发送，请查收邮箱');
            setRegisterCodeCooldown(60);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setRegisterCodeSending(false);
        }
    };

    const sendResetCode = async () => {
        setCodeSending(true);
        try {
            await sendCode(resetEmail.trim(), 'reset');
            setSuccess('验证码已发送，请查收邮箱');
            setCodeCooldown(60);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCodeSending(false);
        }
    };

    const handleCaptchaVerify = async (ticket: string) => {
        setShowCaptcha(false);
        setCaptchaPurpose(null);
        const action = pendingCaptchaActionRef.current;
        pendingCaptchaActionRef.current = null;
        if (!action) return;
        await action(ticket);
    };

    const handleCaptchaCancel = () => {
        setShowCaptcha(false);
        setCaptchaPurpose(null);
        pendingCaptchaActionRef.current = null;
    };

    const handleResetPassword = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        openCaptcha('reset', async (ticket) => {
            setIsLoading(true);
            try {
                await resetPassword(resetEmail.trim(), resetCode.trim(), resetNewPassword, ticket);
                setSuccess('密码重置成功，请使用新密码登录');
                setResetCode('');
                setResetNewPassword('');
                setEmail(resetEmail.trim());
                setActiveTab('login');
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setIsLoading(false);
            }
        });
    };

    const switchTab = (tab: TabType) => {
        if (tab === activeTab) return;
        if (activeTab === 'register' && tab !== 'register') {
            setRegisterCode('');
            setConfirmPassword('');
        }
        setActiveTab(tab);
        setError('');
        setSuccess('');
        setShowCaptcha(false);
        setCaptchaPurpose(null);
        pendingCaptchaActionRef.current = null;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden relative">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {isAuthenticated
                            ? '账户中心'
                            : activeTab === 'login'
                                ? '登录'
                                : activeTab === 'register'
                                    ? '注册'
                                    : activeTab === 'reset'
                                        ? '重置密码'
                                        : '兑换码'}
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
                                    onClick={() => switchTab('login')}
                                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${activeTab === 'login'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    登录
                                </button>
                                <button
                                    onClick={() => switchTab('register')}
                                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${activeTab === 'register'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    注册
                                </button>
                            </div>

                            {/* Captcha Overlay */}
                            {showCaptcha && captchaPurpose && (
                                <div className="absolute inset-0 z-10 bg-white/95 dark:bg-gray-800/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">安全验证</h3>
                                    <p className="text-sm text-gray-500 mb-6">
                                        请完成滑块验证以继续
                                        {captchaPurpose === 'login'
                                            ? '登录'
                                            : captchaPurpose === 'register'
                                                ? '注册'
                                                : '重置密码'}
                                    </p>
                                    <SliderCaptcha
                                        purpose={captchaPurpose}
                                        onVerified={handleCaptchaVerify}
                                        onCancel={handleCaptchaCancel}
                                    />
                                </div>
                            )}

                            {/* Form */}
                            {activeTab === 'reset' ? (
                                <form onSubmit={handleResetPassword} className="space-y-4">
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="email"
                                            value={resetEmail}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResetEmail(e.currentTarget.value)}
                                            placeholder="邮箱地址"
                                            required
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="text"
                                                value={resetCode}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResetCode(e.currentTarget.value)}
                                                placeholder="验证码"
                                                required
                                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={initiateResetCode}
                                            disabled={codeSending || codeCooldown > 0 || !resetEmail.trim()}
                                            className="px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {codeSending
                                                ? '发送中...'
                                                : codeCooldown > 0
                                                    ? `${codeCooldown}s`
                                                    : '发送验证码'}
                                        </button>
                                    </div>

                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="password"
                                            value={resetNewPassword}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResetNewPassword(e.currentTarget.value)}
                                            placeholder="新密码"
                                            required
                                            minLength={6}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    {error && (
                                        <p className="text-sm text-red-500 text-center">{error}</p>
                                    )}
                                    {success && (
                                        <p className="text-sm text-green-500 text-center">{success}</p>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                                        重置密码
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => switchTab('login')}
                                        className="w-full text-sm text-gray-500 hover:text-blue-600 transition-colors"
                                    >
                                        返回登录
                                    </button>
                                </form>
                            ) : (
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
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.currentTarget.value)}
                                            placeholder="密码"
                                            required
                                            minLength={6}
                                            className="w-full pl-10 pr-12 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>

                                    {activeTab === 'register' && (
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.currentTarget.value)}
                                                placeholder="确认密码"
                                                required
                                                minLength={6}
                                                className={`w-full pl-10 pr-12 py-3 rounded-xl border bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 outline-none transition-colors ${
                                                    confirmPassword && password !== confirmPassword
                                                        ? 'border-red-300 dark:border-red-600 focus:ring-red-500'
                                                        : 'border-gray-200 dark:border-gray-600 focus:ring-blue-500'
                                                }`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            >
                                                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    )}

                                    {activeTab === 'login' && (
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setResetEmail(email);
                                                    switchTab('reset');
                                                }}
                                                className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
                                            >
                                                忘记密码？
                                            </button>
                                        </div>
                                    )}

                                    {activeTab === 'register' && (
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={registerCode}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegisterCode(e.currentTarget.value)}
                                                    placeholder="验证码"
                                                    required
                                                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={initiateRegisterCode}
                                                disabled={registerCodeSending || registerCodeCooldown > 0 || !email.trim()}
                                                className="px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {registerCodeSending
                                                    ? '发送中...'
                                                    : registerCodeCooldown > 0
                                                        ? `${registerCodeCooldown}s`
                                                        : '发送验证码'}
                                            </button>
                                        </div>
                                    )}

                                    {error && (
                                        <p className="text-sm text-red-500 text-center">{error}</p>
                                    )}
                                    {success && (
                                        <p className="text-sm text-green-500 text-center">{success}</p>
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
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
