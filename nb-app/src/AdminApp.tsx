import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { SliderCaptcha } from './components/SliderCaptcha';
import { login, resetPassword, sendCode } from './services/authService';
import { useAppStore } from './store/useAppStore';
import { useAuthStore } from './store/useAuthStore';

type AuthMode = 'login' | 'reset';
type CaptchaPurpose = 'login' | 'reset';

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
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaPurpose, setCaptchaPurpose] = useState<CaptchaPurpose | null>(null);
  const pendingCaptchaActionRef = useRef<null | ((ticket: string) => Promise<void>)>(null);

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

  const openCaptcha = (purpose: CaptchaPurpose, action: (ticket: string) => Promise<void>) => {
    pendingCaptchaActionRef.current = action;
    setCaptchaPurpose(purpose);
    setShowCaptcha(true);
  };

  const handleCaptchaVerify = async (ticket: string) => {
    setShowCaptcha(false);
    setCaptchaPurpose(null);
    const action = pendingCaptchaActionRef.current;
    pendingCaptchaActionRef.current = null;
    if (!action) return;
    try {
      await action(ticket);
    } catch (err) {
      setFormError((err as Error).message || 'Request failed. Please try again.');
    }
  };

  const handleCaptchaCancel = () => {
    setShowCaptcha(false);
    setCaptchaPurpose(null);
    pendingCaptchaActionRef.current = null;
  };

  const handleLoginSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');

    openCaptcha('login', async (ticket) => {
      setIsSubmitting(true);
      try {
        const data = await login(email.trim(), password, ticket);
        storeLogin(data.access_token, data.user);
        setPassword('');
      } catch (err) {
        setFormError((err as Error).message || '登录失败，请重试');
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  const handleSendResetCode = () => {
    if (!resetEmail.trim()) {
      setFormError('请输入邮箱');
      return;
    }
    if (codeSending || codeCooldown > 0) return;

    setFormError('');
    setFormSuccess('');
    openCaptcha('reset', async (ticket) => {
      setCodeSending(true);
      try {
        await sendCode(resetEmail.trim(), 'reset', ticket);
        setFormSuccess('验证码已发送');
        setCodeCooldown(60);
      } catch (err) {
        setFormError((err as Error).message || '验证码发送失败');
      } finally {
        setCodeSending(false);
      }
    });
  };

  const handleResetSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');

    openCaptcha('reset', async (ticket) => {
      setIsSubmitting(true);
      try {
        await resetPassword(resetEmail.trim(), resetCode.trim(), resetNewPassword, ticket);
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
    });
  };

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === authMode) return;
    setFormError('');
    setFormSuccess('');
    setShowCaptcha(false);
    setCaptchaPurpose(null);
    pendingCaptchaActionRef.current = null;
    if (nextMode === 'reset') {
      setResetEmail(email.trim());
    }
    setAuthMode(nextMode);
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
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
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/80 shadow-xl p-6 text-slate-900 dark:text-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">访问受限</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">当前账号无管理员权限。</p>
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
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              切换账号
            </button>
            <a
              href="/"
              className="w-full rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 text-sm font-semibold text-center hover:bg-slate-800 dark:hover:bg-slate-100 transition"
            >
              返回应用
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-br from-slate-50 via-amber-50 to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/4 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-500/10" />
        <div className="absolute bottom-[-140px] right-[-80px] h-80 w-80 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-500/10" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col lg:flex-row">
        <aside className="hidden lg:flex w-1/2 flex-col justify-between px-10 py-12">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">DEAI Admin</p>
                <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">管理控制台</h1>
              </div>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              本控制台仅限授权管理员访问。所有操作均会被审计记录以确保合规。
            </p>
            <div className="mt-8 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                集中化租户运营与账单监管
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                敏感操作统一审计追踪
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                安全访问控制与会话监控
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            提示：请使用专用管理账号，并建议开启双因素认证（MFA）。
          </div>
        </aside>

        <main className="flex w-full flex-1 items-center justify-center px-6 py-12 lg:w-1/2 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-2 text-sm font-medium text-slate-500">
                <ShieldCheck className="h-4 w-4 text-amber-500" />
                管理员登录
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                {authMode === 'login' ? '登录管理后台' : '重置密码'}
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {authMode === 'login'
                  ? '请使用管理员凭证访问控制台。'
                  : '我们将先验证您的身份，再协助您更新凭证。'}
              </p>
            </div>

            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/80 shadow-xl p-6">
              {showCaptcha && captchaPurpose && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/95 dark:bg-slate-900/90 p-6">
                  <h3 className="text-base font-semibold">安全验证</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    请完成滑块验证以继续。
                  </p>
                  <div className="mt-4">
                    <SliderCaptcha
                      purpose={captchaPurpose}
                      onVerified={handleCaptchaVerify}
                      onCancel={handleCaptchaCancel}
                    />
                  </div>
                </div>
              )}

              {authMode === 'login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.currentTarget.value)}
                      placeholder="邮箱地址"
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-3 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.currentTarget.value)}
                      placeholder="密码"
                      required
                      minLength={6}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-3 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {formError && (
                    <p className="text-xs text-red-500">{formError}</p>
                  )}
                  {formSuccess && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{formSuccess}</p>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting || !email.trim() || !password}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-3 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    登 录
                  </button>
                  <div className="flex justify-between text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="hover:text-amber-600 transition"
                    >
                      忘记密码？
                    </button>
                    <a href="/" className="hover:text-amber-600 transition">
                      返回应用
                    </a>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.currentTarget.value)}
                      placeholder="邮箱地址"
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-3 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={resetCode}
                        onChange={(event) => setResetCode(event.currentTarget.value)}
                        placeholder="验证码"
                        required
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-3 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendResetCode}
                      disabled={codeSending || codeCooldown > 0 || !resetEmail.trim()}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {codeSending ? '发送中...' : codeCooldown > 0 ? `${codeCooldown}s` : '发送验证码'}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={resetNewPassword}
                      onChange={(event) => setResetNewPassword(event.currentTarget.value)}
                      placeholder="设置新密码"
                      required
                      minLength={6}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-3 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  {formError && (
                    <p className="text-xs text-red-500">{formError}</p>
                  )}
                  {formSuccess && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{formSuccess}</p>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-3 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    确认重置
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="w-full text-xs text-slate-500 hover:text-amber-600 transition"
                  >
                    返回登录
                  </button>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
