import * as React from 'react';
import {
  ShieldAlert,
  Key,
  Lock,
  Trash2,
  Loader2,
  LogOut,
  CheckCircle2,
  Users,
  FileText,
  MessageSquare,
  ArrowLeft,
} from 'lucide-react';
import { api, ApiError, type AdminPostItem, type AdminSettings } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils';

export function AdminPage() {
  const [checking, setChecking] = React.useState(true);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [mustChangeDefault, setMustChangeDefault] = React.useState(false);

  // Login form
  const [loginPassword, setLoginPassword] = React.useState('');
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [loginError, setLoginError] = React.useState<string | null>(null);

  // Settings form
  const [settings, setSettings] = React.useState<AdminSettings | null>(null);
  const [resendApiKey, setResendApiKey] = React.useState('');
  const [resendFromEmail, setResendFromEmail] = React.useState('');
  const [siteName, setSiteName] = React.useState('');
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [settingsMsg, setSettingsMsg] = React.useState<string | null>(null);
  const [settingsErr, setSettingsErr] = React.useState<string | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [savingPwd, setSavingPwd] = React.useState(false);
  const [pwdMsg, setPwdMsg] = React.useState<string | null>(null);
  const [pwdErr, setPwdErr] = React.useState<string | null>(null);

  // Posts moderation
  const [posts, setPosts] = React.useState<AdminPostItem[]>([]);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async () => {
    const [cfg, postRes] = await Promise.all([api.adminGetSettings(), api.adminListPosts()]);
    setSettings(cfg);
    setResendFromEmail(cfg.resendFromEmail);
    setSiteName(cfg.siteName);
    setPosts(postRes.posts);
  }, []);

  React.useEffect(() => {
    document.title = '系统管理后台';
    api
      .adminMe()
      .then(async (res) => {
        if (res.authenticated) {
          setAuthenticated(true);
          setMustChangeDefault(Boolean(res.mustChangeDefaultPassword));
          await loadDashboard();
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [loadDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await api.adminLogin(loginPassword);
      setAuthenticated(true);
      setMustChangeDefault(res.mustChangeDefaultPassword);
      setLoginPassword('');
      await loadDashboard();
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : '登录失败');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsMsg(null);
    setSettingsErr(null);
    setSavingSettings(true);
    try {
      const payload: { resendApiKey?: string; resendFromEmail?: string; siteName?: string } = {
        resendFromEmail: resendFromEmail.trim(),
        siteName: siteName.trim(),
      };
      if (resendApiKey.trim()) {
        payload.resendApiKey = resendApiKey.trim();
      }
      const res = await api.adminSaveSettings(payload);
      setResendApiKey('');
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              hasResendApiKey: res.hasResendApiKey,
              resendApiKeyMasked: res.resendApiKeyMasked,
              resendFromEmail: res.resendFromEmail,
              siteName: res.siteName,
            }
          : prev
      );
      setSettingsMsg('配置已保存并即时生效');
    } catch (err) {
      setSettingsErr(err instanceof ApiError ? err.message : '保存配置失败');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleClearResendKey = async () => {
    setSettingsMsg(null);
    setSettingsErr(null);
    setSavingSettings(true);
    try {
      const res = await api.adminSaveSettings({ resendApiKey: '' });
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              hasResendApiKey: res.hasResendApiKey,
              resendApiKeyMasked: res.resendApiKeyMasked,
            }
          : prev
      );
      setSettingsMsg('已清空 Resend API Key');
    } catch (err) {
      setSettingsErr(err instanceof ApiError ? err.message : '清空失败');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    setPwdErr(null);
    if (newPassword.length < 6) {
      setPwdErr('新密码至少需要 6 个字符');
      return;
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      setPwdErr('两次输入的新密码不一致');
      return;
    }
    setSavingPwd(true);
    try {
      await api.adminChangePassword(currentPassword, newPassword);
      setMustChangeDefault(newPassword === 'admin');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMsg('管理员密码修改成功');
    } catch (err) {
      setPwdErr(err instanceof ApiError ? err.message : '修改密码失败');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleDeletePost = async (id: string) => {
    setDeletingId(id);
    try {
      await api.adminDeletePost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setSettings((prev) =>
        prev
          ? { ...prev, stats: { ...prev.stats, postsCount: Math.max(0, prev.stats.postsCount - 1) } }
          : prev
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = async () => {
    await api.adminLogout().catch(() => {});
    setAuthenticated(false);
    setSettings(null);
    setPosts([]);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900/90 p-7 shadow-2xl">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-800 text-rose-400">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold text-white">管理控制台</h1>
          <p className="mt-1 text-xs text-zinc-400">
            请输入管理员密码以配置 Resend 邮件密钥与社区内容。
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="text-xs font-medium text-zinc-300">
                管理员密码
              </label>
              <Input
                id="admin-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="请输入管理员密码"
                className="border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500"
              />
            </div>

            {loginError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {loginError}
              </div>
            )}

            <Button
              type="submit"
              disabled={loggingIn}
              className="h-10 w-full rounded-xl bg-white text-zinc-900 hover:bg-zinc-200"
            >
              {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              进入后台
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <Lock className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-base font-bold text-zinc-900">社区管理后台</h1>
              <p className="text-xs text-zinc-500">Resend 邮件配置 · 安全改密 · 内容治理</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = '/';
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回社区
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-3.5 w-3.5" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        {mustChangeDefault && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-xs leading-relaxed">
              <p className="font-bold text-sm">安全提醒：当前仍在使用默认初始密码 admin</p>
              <p className="mt-0.5 text-amber-800">
                为防止后台被未授权访问，请尽快在下方「修改管理员密码」卡片中设置高强度密码。
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        {settings && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>注册用户</span>
                <Users className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-extrabold">{settings.stats.usersCount}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>图文帖子</span>
                <FileText className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-extrabold">{settings.stats.postsCount}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>互动评论</span>
                <MessageSquare className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-extrabold">{settings.stats.commentsCount}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Resend & Site Settings */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-rose-500" />
                <h2 className="text-base font-bold">Resend 邮件与站点配置</h2>
              </div>
              {settings?.hasResendApiKey && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  已配置 ({settings.resendApiKeyMasked})
                </span>
              )}
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="resend-api-key" className="text-xs font-semibold text-zinc-700">
                  Resend API Key
                </label>
                <Input
                  id="resend-api-key"
                  type="password"
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                  placeholder="re_...（留空则保持当前配置）"
                />
                {settings?.hasResendApiKey && (
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>当前脱敏密钥：{settings.resendApiKeyMasked}</span>
                    <button
                      type="button"
                      onClick={handleClearResendKey}
                      className="text-red-500 hover:underline"
                    >
                      清空密钥
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="resend-from-email" className="text-xs font-semibold text-zinc-700">
                  发件人邮箱（From Email）
                </label>
                <Input
                  id="resend-from-email"
                  value={resendFromEmail}
                  onChange={(e) => setResendFromEmail(e.target.value)}
                  placeholder="onboarding@resend.dev"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="site-name" className="text-xs font-semibold text-zinc-700">
                  社区名称
                </label>
                <Input
                  id="site-name"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="拾光集 · 轻图文社区"
                />
              </div>

              {settingsMsg && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  {settingsMsg}
                </p>
              )}
              {settingsErr && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {settingsErr}
                </p>
              )}

              <Button type="submit" disabled={savingSettings} className="w-full rounded-xl">
                {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />}
                保存配置
              </Button>
            </form>
          </section>

          {/* Change Admin Password */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-500" />
              <h2 className="text-base font-bold">修改管理员密码</h2>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="cur-pwd" className="text-xs font-semibold text-zinc-700">
                  当前密码
                </label>
                <Input
                  id="cur-pwd"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="输入当前管理员密码"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new-pwd" className="text-xs font-semibold text-zinc-700">
                  新密码（至少 6 位）
                </label>
                <Input
                  id="new-pwd"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="输入新密码"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-pwd" className="text-xs font-semibold text-zinc-700">
                  确认新密码
                </label>
                <Input
                  id="confirm-pwd"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                />
              </div>

              {pwdMsg && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  {pwdMsg}
                </p>
              )}
              {pwdErr && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {pwdErr}
                </p>
              )}

              <Button
                type="submit"
                variant="outline"
                disabled={savingPwd}
                className="w-full rounded-xl"
              >
                {savingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
                更新管理员密码
              </Button>
            </form>
          </section>
        </div>

        {/* Posts Moderation */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-bold">内容管理（最新 50 条图文）</h2>
          {posts.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-400">暂无社区图文</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900">{post.title}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {post.author.nickname} ({post.author.email}) ·{' '}
                      {formatRelativeTime(post.createdAt)} · 点赞 {post.likesCount} · 评论{' '}
                      {post.commentsCount}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={deletingId === post.id}
                    onClick={() => handleDeletePost(post.id)}
                    className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    {deletingId === post.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    下架删除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
