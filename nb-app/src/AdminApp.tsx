import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { login, resetPassword, sendCode } from './services/authService';
import { useAppStore } from './store/useAppStore';
import { useAuthStore } from './store/useAuthStore';

type AuthMode = 'login' | 'reset';

export const AdminApp: React.FC = () => {
  const { settings } = useAppStore();
  const { isAuthenticated, isLoading: authLoading, user, initAuth, login: storeLogin, logout } = useAuthStore();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [codeSending, setCodeSending] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCodeCooldown((current) => (current > 1 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  useEffect(() => {
    const root = window.document.documentElement;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemTheme.matches);
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');
    setIsSubmitting(true);

    try {
      const data = await login(email.trim(), password);
      storeLogin(data.access_token, data.user);
      setPassword('');
    } catch (err) {
      setFormError((err as Error).message || '登录失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendResetCode = async () => {
    if (!resetEmail.trim()) {
      setFormError('请输入邮箱');
      return;
    }
    if (codeSending || codeCooldown > 0) return;

    setFormError('');
    setFormSuccess('');
    setCodeSending(true);
    try {
      await sendCode(resetEmail.trim(), 'reset');
      setFormSuccess('验证码已发送');
      setCodeCooldown(60);
    } catch (err) {
      setFormError((err as Error).message || '验证码发送失败');
    } finally {
      setCodeSending(false);
    }
  };

  const handleResetSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');
    setIsSubmitting(true);

    try {
      await resetPassword(resetEmail.trim(), resetCode.trim(), resetNewPassword);
      setFormSuccess('密码已重置，请使用新密码登录');
      setAuthMode('login');
      setEmail(resetEmail.trim());
      setResetCode('');
      setResetNewPassword('');
    } catch (err) {
      setFormError((err as Error).message || '重置失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === authMode) return;
    setFormError('');
    setFormSuccess('');
    if (nextMode === 'reset') {
      setResetEmail(email.trim());
    }
    setAuthMode(nextMode);
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isAuthenticated && user?.is_admin) {
    return (
      <AdminDashboard
        onLogout={() => undefined}
        onExit={() => window.location.assign('/')}
      />
    );
  }

  if (isAuthenticated && !user?.is_admin) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-100 dark:bg-gray-950 px-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-4">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">访问受限</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">当前账号无管理员权限。</p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                logout();
                setPassword('');
                setAuthMode('login');
              }}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              切换账号
            </button>
            <a
              href="/"
              className="w-full rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition"
            >
              返回应用
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-950 px-4 py-12 transition-colors duration-300">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo_new.png" alt="DEAI Admin" className="h-12 w-12 mx-auto mb-4 rounded-lg shadow-sm" />
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            DEAI Admin
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {authMode === 'login' ? '请登录以继续' : '重置您的管理员密码'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 shadow-sm rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
          {authMode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    邮箱地址
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.currentTarget.value)}
                      required
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-10 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.currentTarget.value)}
                      required
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-10 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {formSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !email.trim() || !password}
                className="w-full flex justify-center items-center gap-2 rounded-md bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : '登录'}
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </button>

              <div className="flex justify-between items-center text-xs mt-4">
                <a href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors">
                  返回前台
                </a>
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  忘记密码？
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetSubmit} className="space-y-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    邮箱地址
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.currentTarget.value)}
                      required
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-10 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={resetCode}
                      onChange={(event) => setResetCode(event.currentTarget.value)}
                      placeholder="验证码"
                      required
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-10 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendResetCode}
                    disabled={codeSending || codeCooldown > 0 || !resetEmail.trim()}
                    className="shrink-0 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm min-w-[90px]"
                  >
                    {codeSending ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : codeCooldown > 0 ? `${codeCooldown}s` : '获取验证码'}
                  </button>
                </div>

                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    新密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={resetNewPassword}
                      onChange={(event) => setResetNewPassword(event.currentTarget.value)}
                      required
                      minLength={6}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-10 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {formSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 rounded-md bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : '重置密码'}
              </button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors"
                >
                  ← 返回登录
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-gray-400 dark:text-gray-600">
          <p>&copy; {new Date().getFullYear()} DEAI. Internal System.</p>
        </div>
      </div>
    </div>
  );
};
