import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
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
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')?.setAttribute('content', '#0f172a');
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')?.setAttribute('content', '#0f172a');
      } else {
        root.classList.remove('dark');
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')?.setAttribute('content', '#f8fafc');
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')?.setAttribute('content', '#f8fafc');
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
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在检查会话...
        </div>
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
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-6">
        <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-900/50 bg-white/95 dark:bg-gray-900/80 shadow-xl p-6 text-gray-900 dark:text-gray-100 animate-scale-in">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">访问受限</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">当前账号无管理员权限。</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                logout();
                setPassword('');
                setAuthMode('login');
              }}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              切换账号
            </button>
            <a
              href="/"
              className="w-full rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2.5 text-sm font-semibold text-center hover:bg-gray-800 dark:hover:bg-gray-100 transition"
            >
              返回应用
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-300">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-400/20 blur-[100px] animate-float-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/20 blur-[100px] animate-float-slow" style={{ animationDelay: '-2s' }} />
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full bg-blue-400/10 blur-[80px] animate-float-slow" style={{ animationDelay: '-4s' }} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-7xl flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24 px-6 py-12">

        {/* Left Side: Branding (Visible on Desktop) */}
        <aside className="hidden lg:flex flex-col max-w-lg">
          <div className="flex items-center gap-4 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-amber-500/30 blur-xl rounded-full animate-pulse-fast"></div>
              <img src="/logo_new.png" alt="Logo" className="relative h-20 w-20 rounded-2xl shadow-2xl shadow-amber-500/30 transform hover:scale-105 transition-transform duration-300" />
            </div>
            <div>
              <h1 className="text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                DEAI Admin
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider border border-amber-200 dark:border-amber-800">Control Panel</span>
                <p className="text-sm text-gray-500 dark:text-gray-400">Version 2.0</p>
              </div>
            </div>
          </div>

          <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300 mb-8 font-light">
            欢迎回到管理控制台。在这里，您可以全面掌控租户运营、监控系统状态、管理用户权限以及追踪审计日志。
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-white/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">企业级安全</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">全链路审计追踪与访问控制</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-white/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-lg shadow-indigo-500/30">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">智能监控</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">实时系统状态与业务数据分析</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Side: Login Form */}
        <main className="w-full max-w-md">
          <div className="relative rounded-3xl overflow-hidden shadow-2xl animate-scale-in">
            {/* Glassmorphism Card */}
            <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl" />
            <div className="absolute inset-0 border border-white/40 dark:border-white/10 rounded-3xl pointer-events-none" />

            <div className="relative p-8 sm:p-10">
              <div className="text-center mb-8 lg:text-left lg:hidden">
                <img src="/logo_new.png" alt="Logo" className="h-12 w-12 mx-auto mb-4 rounded-xl shadow-lg" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">管理员登录</h2>
              </div>

              <h2 className="hidden lg:block text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {authMode === 'login' ? '登录您的账户' : '重置密码'}
              </h2>
              <p className="hidden lg:block text-sm text-gray-500 dark:text-gray-400 mb-8">
                {authMode === 'login' ? '请输入您的管理员凭证以继续。' : '验证身份后即可设置新密码。'}
              </p>

              {authMode === 'login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-5">
                  <div className="space-y-4">
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 group-focus-within:text-amber-500 transition-colors" />
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.currentTarget.value)}
                        placeholder="邮箱地址"
                        required
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-950/50 px-12 py-3.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all"
                      />
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 group-focus-within:text-amber-500 transition-colors" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.currentTarget.value)}
                        placeholder="密码"
                        required
                        minLength={6}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-950/50 px-12 py-3.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {formError && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 animate-fade-in">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}
                  {formSuccess && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 animate-fade-in">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span>{formSuccess}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || !email.trim() || !password}
                    className="group relative w-full overflow-hidden rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg shadow-gray-900/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none transition-all duration-200"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                    <div className="flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold tracking-wide">
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <span>登 录</span>}
                      {!isSubmitting && <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />}
                    </div>
                  </button>

                  <div className="flex justify-between items-center text-xs font-medium pt-2">
                    <a href="/" className="text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                      ← 返回前台
                    </a>
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                    >
                      忘记密码？
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-5">
                  <div className="space-y-4">
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 group-focus-within:text-amber-500 transition-colors" />
                      <input
                        type="email"
                        autoComplete="email"
                        value={resetEmail}
                        onChange={(event) => setResetEmail(event.currentTarget.value)}
                        placeholder="邮箱地址"
                        required
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-950/50 px-12 py-3.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all"
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1 group">
                        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 group-focus-within:text-amber-500 transition-colors" />
                        <input
                          type="text"
                          value={resetCode}
                          onChange={(event) => setResetCode(event.currentTarget.value)}
                          placeholder="验证码"
                          required
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-950/50 px-12 py-3.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendResetCode}
                        disabled={codeSending || codeCooldown > 0 || !resetEmail.trim()}
                        className="shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:border-amber-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
                      >
                        {codeSending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : codeCooldown > 0 ? `${codeCooldown}s` : '发送验证码'}
                      </button>
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 group-focus-within:text-amber-500 transition-colors" />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={resetNewPassword}
                        onChange={(event) => setResetNewPassword(event.currentTarget.value)}
                        placeholder="设置新密码"
                        required
                        minLength={6}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-950/50 px-12 py-3.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {formError && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 animate-fade-in">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}
                  {formSuccess && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 animate-fade-in">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span>{formSuccess}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group w-full rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <div className="flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold tracking-wide">
                      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <span>确认重置</span>}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="w-full text-xs font-medium text-gray-500 hover:text-amber-600 transition-colors py-2"
                  >
                    返回登录
                  </button>
                </form>
              )}
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
            &copy; {new Date().getFullYear()} DEAI. All rights reserved. <br />
            Secure Admin Gateway
          </p>
        </main>
      </div>
    </div>
  );
};
