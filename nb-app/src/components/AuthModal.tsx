/**
 * 登录/注册弹窗组件 - 优化版
 */
import React, { useEffect, useState } from 'react';
import { X, Mail, Lock, User, Loader2, Gift, Eye, EyeOff, Sparkles } from 'lucide-react';
import { login, register, redeemCode, resetPassword, sendCode } from '../services/authService';
import { useAuthStore } from '../store/useAuthStore';
import { useUiStore } from '../store/useUiStore';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type TabType = 'login' | 'register' | 'redeem' | 'reset';

export const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
    const { addToast } = useUiStore();
    const prefersReducedMotion = useReducedMotion();
    const [shouldRender, setShouldRender] = useState(isOpen);
    const [isVisible, setIsVisible] = useState(isOpen);
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

    const { login: storeLogin, isAuthenticated, user, refreshCredits } = useAuthStore();

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            if (prefersReducedMotion) {
                setIsVisible(true);
            } else {
                const frame = window.requestAnimationFrame(() => setIsVisible(true));
                return () => window.cancelAnimationFrame(frame);
            }
        } else {
            if (prefersReducedMotion) {
                setIsVisible(false);
                setShouldRender(false);
            } else {
                setIsVisible(false);
                const timer = window.setTimeout(() => setShouldRender(false), 200);
                return () => window.clearTimeout(timer);
            }
        }
    }, [isOpen, shouldRender, prefersReducedMotion]);

    if (!shouldRender) return null;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            const { access_token, user } = await login(email, password);
            storeLogin(access_token, user);
            addToast('登录成功！', 'success');
            onClose();
        } catch (err) {
            const errorMessage = (err as Error).message;
            setError(errorMessage);
            addToast(`登录失败：${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!registerCode.trim()) {
            setError('请输入验证码');
            addToast('请输入邮箱验证码', 'error');
            return;
        }
        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            addToast('两次输入的密码不一致', 'error');
            return;
        }

        setIsLoading(true);
        try {
            const { access_token, user } = await register(
                email,
                password,
                undefined,
                registerCode.trim()
            );
            storeLogin(access_token, user);
            addToast('注册成功！欢迎加入', 'success');
            onClose();
        } catch (err) {
            const errorMessage = (err as Error).message;
            setError(errorMessage);
            addToast(`注册失败：${errorMessage}`, 'error');
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
            const addedParts: string[] = [];
            if (result.credits_added) addedParts.push(`通用 +${result.credits_added}`);
            if (result.pro3_credits_added) addedParts.push(`Pro3 +${result.pro3_credits_added}`);
            if (result.flash_credits_added) addedParts.push(`Flash +${result.flash_credits_added}`);
            const addedText = addedParts.length ? addedParts.join('，') : '无新增积分';

            const generalBalance = result.general_balance ?? result.new_balance;
            const pro3Balance = typeof result.pro3_balance === 'number' ? result.pro3_balance : undefined;
            const flashBalance = typeof result.flash_balance === 'number' ? result.flash_balance : undefined;
            const balanceParts = [`通用 ${generalBalance}`];
            if (pro3Balance !== undefined) balanceParts.push(`Pro3 ${pro3Balance}`);
            if (flashBalance !== undefined) balanceParts.push(`Flash ${flashBalance}`);

            const totalBalance = typeof result.total_balance === 'number'
                ? result.total_balance
                : (pro3Balance !== undefined && flashBalance !== undefined)
                    ? generalBalance + pro3Balance + flashBalance
                    : undefined;
            const balanceText = totalBalance !== undefined
                ? `${balanceParts.join(' / ')}，总计 ${totalBalance}`
                : balanceParts.join(' / ');

            setSuccess(`兑换成功！${addedText}；当前余额 ${balanceText}`);
            setRedeemCodeInput('');
            refreshCredits();
            addToast(`兑换成功！${addedText}`, 'success');
        } catch (err) {
            const errorMessage = (err as Error).message;
            setError(errorMessage);
            addToast(`兑换失败：${errorMessage}`, 'error');
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

    const initiateRegisterCode = async () => {
        if (!email.trim()) {
            setError('请输入邮箱地址');
            addToast('请先输入邮箱地址', 'error');
            return;
        }
        if (registerCodeCooldown > 0 || registerCodeSending) return;
        setError('');
        setSuccess('');
        setRegisterCodeSending(true);
        try {
            await sendCode(email.trim(), 'register');
            setSuccess('验证码已发送，请查收邮箱');
            setRegisterCodeCooldown(60);
            addToast('验证码已发送，请查收邮箱', 'success');
        } catch (err) {
            const errorMessage = (err as Error).message;
            setError(errorMessage);
            addToast(`发送验证码失败：${errorMessage}`, 'error');
        } finally {
            setRegisterCodeSending(false);
        }
    };

    const initiateResetCode = async () => {
        if (!resetEmail.trim()) {
            setError('请输入邮箱地址');
            addToast('请先输入邮箱地址', 'error');
            return;
        }
        if (codeCooldown > 0 || codeSending) return;
        setError('');
        setSuccess('');
        setCodeSending(true);
        try {
            await sendCode(resetEmail.trim(), 'reset');
            setSuccess('验证码已发送，请查收邮箱');
            setCodeCooldown(60);
            addToast('验证码已发送，请查收邮箱', 'success');
        } catch (err) {
            const errorMessage = (err as Error).message;
            setError(errorMessage);
            addToast(`发送验证码失败：${errorMessage}`, 'error');
        } finally {
            setCodeSending(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        setIsLoading(true);
        try {
            await resetPassword(resetEmail.trim(), resetCode.trim(), resetNewPassword);
            setSuccess('密码重置成功，请使用新密码登录');
            setResetCode('');
            setResetNewPassword('');
            setEmail(resetEmail.trim());
            setActiveTab('login');
            addToast('密码重置成功，请使用新密码登录', 'success');
        } catch (err) {
            const errorMessage = (err as Error).message;
            setError(errorMessage);
            addToast(`密码重置失败：${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
        }
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
    };

    // 输入框组件 - Liquid Glass 风格
    const InputField = ({
        icon: Icon,
        type = 'text',
        value,
        onChange,
        placeholder,
        required = false,
        rightElement,
        error: hasError,
    }: {
        icon: React.ElementType;
        type?: string;
        value: string;
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
        placeholder: string;
        required?: boolean;
        rightElement?: React.ReactNode;
        error?: boolean;
    }) => (
        <div className={`relative group liquid-glass-input ${hasError ? 'ring-2 ring-red-400' : ''}`}>
            <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-cream-500 transition-colors z-10" />
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                className={`w-full pl-12 ${rightElement ? 'pr-12' : 'pr-4'} py-4 rounded-xl bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none relative z-10`}
            />
            {rightElement && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                    {rightElement}
                </div>
            )}
        </div>
    );

    // 密码输入框组件 - Liquid Glass 风格
    const PasswordField = ({
        value,
        onChange,
        placeholder,
        showPassword: show,
        setShowPassword: setShow,
        hasError,
    }: {
        value: string;
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
        placeholder: string;
        showPassword: boolean;
        setShowPassword: (show: boolean) => void;
        hasError?: boolean;
    }) => (
        <div className={`relative group liquid-glass-input ${hasError ? 'ring-2 ring-red-400' : ''}`}>
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-cream-500 transition-colors z-10" />
            <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required
                className="w-full pl-12 pr-12 py-4 rounded-xl bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none relative z-10"
            />
            <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 z-10"
            >
                {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
        </div>
    );

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xl p-4 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className={`liquid-glass-pro w-full max-w-md overflow-hidden relative flex flex-col max-h-[90dvh] transition-all duration-300 transform ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}>
                {/* Header with liquid glass effect */}
                <div className="relative flex items-center justify-between px-6 py-5 shrink-0 border-b border-white/20 dark:border-white/10 bg-gradient-to-r from-white/40 to-amber-50/40 dark:from-gray-800/40 dark:to-gray-700/40">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cream-400 to-amber-500 flex items-center justify-center shadow-lg shadow-cream-500/25">
                            {isAuthenticated ? (
                                <User className="w-5 h-5 text-white" />
                            ) : activeTab === 'login' ? (
                                <Lock className="w-5 h-5 text-white" />
                            ) : activeTab === 'register' ? (
                                <Mail className="w-5 h-5 text-white" />
                            ) : (
                                <Lock className="w-5 h-5 text-white" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                                {isAuthenticated
                                    ? '账户中心'
                                    : activeTab === 'login'
                                        ? '欢迎回来'
                                        : activeTab === 'register'
                                            ? '创建账户'
                                            : '重置密码'}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {isAuthenticated ? '管理您的账户信息' : activeTab === 'login' ? '登录以继续使用' : activeTab === 'register' ? '注册开始创作之旅' : '找回您的账户密码'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8 flex-1 overflow-y-auto pb-safe">
                    <div key={isAuthenticated ? 'account' : activeTab} className="animate-fade-in">
                        {isAuthenticated && user ? (
                            // 已登录 - 显示用户信息和兑换码
                            <div className="space-y-8">
                                {/* 用户信息卡片 */}
                                <div className="text-center py-6">
                                    <div className="w-24 h-24 bg-gradient-to-br from-cream-400 via-amber-500 to-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-cream-500/20 ring-4 ring-cream-100 dark:ring-cream-900/20">
                                        <User className="w-12 h-12 text-white" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                        {user.nickname || user.email.split('@')[0]}
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                </div>

                                {/* 余额卡片 */}
                                <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-amber-900/20 dark:via-orange-900/20 dark:to-rose-900/10 rounded-3xl p-8 text-center border border-amber-100 dark:border-amber-800/30 shadow-sm">
                                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-3 font-medium">当前灵感余额</p>
                                    <div className="flex items-center justify-center gap-3">
                                        <span className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
                                            {user.credit_balance}
                                        </span>
                                        <span className="text-base text-amber-600 dark:text-amber-400">次</span>
                                    </div>
                                </div>

                                {/* 兑换码 */}
                                <form onSubmit={handleRedeem} className="space-y-5">
                                    <div className="relative liquid-glass-input">
                                        <Gift className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-cream-500 transition-colors z-10" />
                                        <input
                                            type="text"
                                            value={redeemCodeInput}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedeemCodeInput(e.currentTarget.value.toUpperCase())}
                                            placeholder="输入兑换码获取灵感"
                                            className="w-full pl-12 pr-4 py-4 rounded-xl bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none relative z-10"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isLoading || !redeemCodeInput.trim()}
                                        className="w-full py-4 liquid-glass-btn text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
                                        兑换灵感
                                    </button>
                                </form>

                                {/* 状态提示 */}
                                {error && (
                                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400 text-center">
                                        {error}
                                    </div>
                                )}
                                {success && (
                                    <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-sm text-green-600 dark:text-green-400 text-center">
                                        {success}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Tabs with liquid glass */}
                                <div className="flex gap-2 p-1.5 liquid-glass rounded-2xl mb-8">
                                    <button
                                        onClick={() => switchTab('login')}
                                        className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${activeTab === 'login'
                                            ? 'bg-white/80 dark:bg-gray-600/80 text-cream-600 dark:text-cream-400 shadow-lg'
                                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/30'
                                            }`}
                                    >
                                        <Sparkles className="w-4 h-4 inline mr-1.5" />
                                        登录
                                    </button>
                                    <button
                                        onClick={() => switchTab('register')}
                                        className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${activeTab === 'register'
                                            ? 'bg-white/80 dark:bg-gray-600/80 text-cream-600 dark:text-cream-400 shadow-lg'
                                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/30'
                                            }`}
                                    >
                                        注册
                                    </button>
                                </div>

                                {/* Form */}
                                {activeTab === 'reset' ? (
                                    <form onSubmit={handleResetPassword} className="space-y-5">
                                        <InputField
                                            icon={Mail}
                                            type="email"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.currentTarget.value)}
                                            placeholder="邮箱地址"
                                            required
                                        />

                                        <div className="flex gap-3">
                                            <div className="relative flex-1 liquid-glass-input">
                                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-cream-500 transition-colors z-10" />
                                                <input
                                                    type="text"
                                                    value={resetCode}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResetCode(e.currentTarget.value)}
                                                    placeholder="验证码"
                                                    required
                                                    className="w-full pl-12 pr-4 py-4 rounded-xl bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none relative z-10"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={initiateResetCode}
                                                disabled={codeSending || codeCooldown > 0 || !resetEmail.trim()}
                                                className="px-5 py-4 liquid-glass-btn text-cream-600 dark:text-cream-400 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                            >
                                                {codeSending
                                                    ? '发送中...'
                                                    : codeCooldown > 0
                                                        ? `${codeCooldown}s`
                                                        : '发送验证码'}
                                            </button>
                                        </div>

                                        <InputField
                                            icon={Lock}
                                            type="password"
                                            value={resetNewPassword}
                                            onChange={(e) => setResetNewPassword(e.currentTarget.value)}
                                            placeholder="新密码"
                                            required
                                        />

                                        {error && (
                                            <p className="text-sm text-red-500 text-center">{error}</p>
                                        )}
                                        {success && (
                                            <p className="text-sm text-green-500 text-center">{success}</p>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full py-4 liquid-glass-btn text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                                            重置密码
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => switchTab('login')}
                                            className="w-full text-sm text-gray-500 hover:text-cream-600 dark:hover:text-cream-400 transition-colors"
                                        >
                                            返回登录
                                        </button>
                                    </form>
                                ) : (
                                    <form onSubmit={activeTab === 'login' ? handleLogin : handleRegister} className="space-y-5">
                                        {/* 邮箱 */}
                                        <InputField
                                            icon={Mail}
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.currentTarget.value)}
                                            placeholder="邮箱地址"
                                            required
                                        />

                                        {/* 密码 */}
                                        <PasswordField
                                            value={password}
                                            onChange={(e) => setPassword(e.currentTarget.value)}
                                            placeholder="密码"
                                            showPassword={showPassword}
                                            setShowPassword={setShowPassword}
                                        />

                                        {/* 确认密码 - 仅注册 */}
                                        {activeTab === 'register' && (
                                            <PasswordField
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                                                placeholder="确认密码"
                                                showPassword={showConfirmPassword}
                                                setShowPassword={setShowConfirmPassword}
                                                hasError={confirmPassword.length > 0 && password !== confirmPassword}
                                            />
                                        )}

                                        {/* 忘记密码 - 仅登录 */}
                                        {activeTab === 'login' && (
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setResetEmail(email);
                                                        switchTab('reset');
                                                    }}
                                                    className="text-sm text-gray-500 hover:text-cream-600 dark:hover:text-cream-400 transition-colors font-medium"
                                                >
                                                    忘记密码？
                                                </button>
                                            </div>
                                        )}

                                        {/* 验证码 - 仅注册 */}
                                        {activeTab === 'register' && (
                                            <div className="flex gap-3">
                                                <div className="relative flex-1 group">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-cream-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        value={registerCode}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegisterCode(e.currentTarget.value)}
                                                        placeholder="验证码"
                                                        required
                                                        className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-cream-400 focus:border-cream-400 outline-none transition-all"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={initiateRegisterCode}
                                                    disabled={registerCodeSending || registerCodeCooldown > 0 || !email.trim()}
                                                    className="px-5 py-4 liquid-glass-btn text-cream-600 dark:text-cream-400 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                >
                                                    {registerCodeSending
                                                        ? '发送中...'
                                                        : registerCodeCooldown > 0
                                                            ? `${registerCodeCooldown}s`
                                                            : '获取验证码'}
                                                </button>
                                            </div>
                                        )}

                                        {/* 状态提示 */}
                                        {error && (
                                            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400 text-center">
                                                {error}
                                            </div>
                                        )}
                                        {success && (
                                            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-sm text-green-600 dark:text-green-400 text-center">
                                                {success}
                                            </div>
                                        )}

                                        {/* 提交按钮 */}
                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full py-4 liquid-glass-btn text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                                            {activeTab === 'login' ? '安全登录' : '立即注册'}
                                        </button>
                                    </form>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
