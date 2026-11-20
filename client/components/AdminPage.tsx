import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Send,
  Settings,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  adminApiRequest,
  clearAdminToken,
  getAdminToken,
  setAdminToken,
} from '../api';

interface AdminInfo {
  id: string;
  username: string;
  must_change_password: boolean;
}

interface AdminSettings {
  resend_api_key_configured: boolean;
  resend_api_key_masked: string;
  resend_from_email: string;
  site_name: string;
  otp_expiry_minutes: number;
  max_images_per_post: number;
}

interface AdminStats {
  users: number;
  email_users: number;
  posts: number;
  media: number;
  comments: number;
  likes: number;
  reposts: number;
  clicks: number;
}

interface AdminPageProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ theme, onToggleTheme }) => {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Settings form state
  const [siteName, setSiteName] = useState('');
  const [resendApiKeyInput, setResendApiKeyInput] = useState('');
  const [clearResendKey, setClearResendKey] = useState(false);
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [otpExpiryMinutes, setOtpExpiryMinutes] = useState(10);
  const [maxImagesPerPost, setMaxImagesPerPost] = useState(4);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  // Test email state
  const [testToEmail, setTestToEmail] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Credentials form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsError, setCredsError] = useState('');

  const loadAdminConsole = async () => {
    setCheckingAuth(true);
    try {
      const data = await adminApiRequest<{
        admin: AdminInfo;
        settings: AdminSettings;
        stats: AdminStats;
      }>('/api/v1/admin/settings');

      setAdmin(data.admin);
      setSettings(data.settings);
      setStats(data.stats);
      setSiteName(data.settings.site_name);
      setResendFromEmail(data.settings.resend_from_email);
      setOtpExpiryMinutes(data.settings.otp_expiry_minutes);
      setMaxImagesPerPost(data.settings.max_images_per_post);
      setNewUsername(data.admin.username);
    } catch {
      setAdmin(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    if (getAdminToken()) {
      loadAdminConsole();
    } else {
      // Also try cookie-backed session in case page was reloaded
      loadAdminConsole();
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await adminApiRequest<{
        token: string;
        admin: AdminInfo;
      }>('/api/v1/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });

      if (res.token) {
        setAdminToken(res.token);
      }
      setLoginPassword('');
      toast.success('管理员登录成功');
      await loadAdminConsole();
    } catch (err: any) {
      setLoginError(err?.message || '登录失败，请检查管理员账号与密码');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await adminApiRequest('/api/v1/admin/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearAdminToken();
    setAdmin(null);
    setSettings(null);
    setStats(null);
    toast.success('已退出管理后台');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg('');

    try {
      const res = await adminApiRequest<{
        success: boolean;
        settings: AdminSettings;
      }>('/api/v1/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          resend_api_key: resendApiKeyInput.trim() || undefined,
          clear_resend_api_key: clearResendKey,
          resend_from_email: resendFromEmail.trim(),
          site_name: siteName.trim(),
          otp_expiry_minutes: Number(otpExpiryMinutes),
          max_images_per_post: Number(maxImagesPerPost),
        }),
      });

      setSettings(res.settings);
      setResendApiKeyInput('');
      setClearResendKey(false);
      setSettingsMsg('系统配置已保存并即时生效');
      toast.success('系统配置已保存');
    } catch (err: any) {
      toast.error(err?.message || '保存配置失败');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testToEmail.trim()) {
      toast.error('请输入测试收件邮箱');
      return;
    }

    setSendingTestEmail(true);
    try {
      await adminApiRequest('/api/v1/admin/settings/test-email', {
        method: 'POST',
        body: JSON.stringify({ to_email: testToEmail.trim() }),
      });
      toast.success('测试邮件发送成功！请查收收件箱');
    } catch (err: any) {
      toast.error(err?.message || '测试邮件发送失败');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredsError('');
    setSavingCreds(true);

    try {
      const res = await adminApiRequest<{
        success: boolean;
        admin: AdminInfo;
      }>('/api/v1/admin/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: currentPassword,
          new_username: newUsername.trim() || undefined,
          new_password: newPassword,
        }),
      });

      setAdmin(res.admin);
      setCurrentPassword('');
      setNewPassword('');
      toast.success('管理员账号密码已更新');
    } catch (err: any) {
      setCredsError(err?.message || '修改凭据失败');
    } finally {
      setSavingCreds(false);
    }
  };

  return (
    <div className="x-admin-wrapper" data-theme={theme}>
      <header className="x-admin-topbar">
        <div className="x-admin-brand">
          <ShieldCheck size={22} className="x-admin-brand-icon" />
          <span>社区系统管理后台</span>
        </div>

        <div className="x-admin-topbar-actions">
          <button
            type="button"
            className="x-theme-toggle-btn"
            onClick={onToggleTheme}
            aria-label="切换明暗主题"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {admin && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleLogout}
            >
              <LogOut size={15} />
              <span>退出后台</span>
            </button>
          )}
        </div>
      </header>

      <main className="x-admin-container">
        {checkingAuth ? (
          <div className="x-admin-loading">
            <Loader2 size={28} className="x-spin" />
            <span>正在验证管理员会话...</span>
          </div>
        ) : !admin ? (
          <div className="x-admin-login-card">
            <div className="x-admin-login-header">
              <KeyRound size={28} className="x-admin-brand-icon" />
              <h1>管理员登录</h1>
              <p>仅限系统管理员访问 · 初始默认账号与密码均为 admin</p>
            </div>

            <form onSubmit={handleLogin} className="x-admin-form">
              <div className="form-group">
                <label htmlFor="admin-username" className="form-label">
                  管理员账号
                </label>
                <input
                  id="admin-username"
                  type="text"
                  className="x-admin-input"
                  placeholder="请输入管理员用户名"
                  value={loginUsername}
                  onChange={(e) => {
                    setLoginUsername(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="admin-password" className="form-label">
                  管理员密码
                </label>
                <input
                  id="admin-password"
                  type="password"
                  className="x-admin-input"
                  placeholder="请输入管理员密码"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  required
                />
              </div>

              {loginError && (
                <div className="error-banner" role="alert">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary x-admin-submit-btn"
                disabled={loggingIn}
              >
                {loggingIn ? '登录中...' : '登录管理后台'}
              </button>
            </form>
          </div>
        ) : (
          <div className="x-admin-dashboard">
            {admin.must_change_password && (
              <div className="x-admin-warning-banner" role="status">
                <AlertTriangle size={18} />
                <span>
                  安全提示：当前账号（{admin.username}）仍在使用默认密码，请在下方“安全与账号设置”中尽快修改密码。
                </span>
              </div>
            )}

            {/* Real Platform Statistics */}
            {stats && (
              <section className="x-admin-section">
                <h2 className="x-admin-section-title">平台运行数据概览</h2>
                <div className="x-admin-stats-grid">
                  <div className="x-admin-stat-box">
                    <span className="x-admin-stat-label">总成员数</span>
                    <strong className="x-admin-stat-value">{stats.users}</strong>
                  </div>
                  <div className="x-admin-stat-box">
                    <span className="x-admin-stat-label">邮箱绑定用户</span>
                    <strong className="x-admin-stat-value">{stats.email_users}</strong>
                  </div>
                  <div className="x-admin-stat-box">
                    <span className="x-admin-stat-label">动态总数</span>
                    <strong className="x-admin-stat-value">{stats.posts}</strong>
                  </div>
                  <div className="x-admin-stat-box">
                    <span className="x-admin-stat-label">图片媒体</span>
                    <strong className="x-admin-stat-value">{stats.media}</strong>
                  </div>
                  <div className="x-admin-stat-box">
                    <span className="x-admin-stat-label">总点击量</span>
                    <strong className="x-admin-stat-value">{stats.clicks}</strong>
                  </div>
                  <div className="x-admin-stat-box">
                    <span className="x-admin-stat-label">总点赞数</span>
                    <strong className="x-admin-stat-value">{stats.likes}</strong>
                  </div>
                  <div className="x-admin-stat-box">
                    <span className="x-admin-stat-label">总转发数</span>
                    <strong className="x-admin-stat-value">{stats.reposts}</strong>
                  </div>
                  <div className="x-admin-stat-box">
                    <span className="x-admin-stat-label">总评论数</span>
                    <strong className="x-admin-stat-value">{stats.comments}</strong>
                  </div>
                </div>
              </section>
            )}

            <div className="x-admin-grid-2">
              {/* Resend & Community Settings */}
              <section className="x-admin-card">
                <div className="x-admin-card-header">
                  <Settings size={18} />
                  <h2>Resend 邮件服务与社区配置</h2>
                </div>

                <form onSubmit={handleSaveSettings} className="x-admin-form">
                  <div className="form-group">
                    <label htmlFor="setting-site-name" className="form-label">
                      社区名称
                    </label>
                    <input
                      id="setting-site-name"
                      type="text"
                      className="x-admin-input"
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <div className="x-admin-label-row">
                      <label htmlFor="setting-resend-key" className="form-label">
                        Resend API Key
                      </label>
                      <span
                        className={`x-status-pill ${
                          settings?.resend_api_key_configured ? 'ok' : 'empty'
                        }`}
                      >
                        {settings?.resend_api_key_configured
                          ? `已配置 (${settings.resend_api_key_masked})`
                          : '未配置'}
                      </span>
                    </div>
                    <input
                      id="setting-resend-key"
                      type="password"
                      className="x-admin-input"
                      placeholder="输入新的 Resend API Key（留空保持当前配置不变）"
                      value={resendApiKeyInput}
                      onChange={(e) => {
                        setResendApiKeyInput(e.target.value);
                        if (e.target.value.trim()) setClearResendKey(false);
                      }}
                    />
                    {settings?.resend_api_key_configured && (
                      <label className="x-checkbox-row">
                        <input
                          type="checkbox"
                          checked={clearResendKey}
                          onChange={(e) => {
                            setClearResendKey(e.target.checked);
                            if (e.target.checked) setResendApiKeyInput('');
                          }}
                        />
                        <span>清空已保存的 Resend API Key</span>
                      </label>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="setting-from-email" className="form-label">
                      发件人邮箱 (From Email)
                    </label>
                    <input
                      id="setting-from-email"
                      type="text"
                      className="x-admin-input"
                      placeholder="noreply@yourdomain.com"
                      value={resendFromEmail}
                      onChange={(e) => setResendFromEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="x-admin-inline-fields">
                    <div className="form-group">
                      <label htmlFor="setting-otp-expiry" className="form-label">
                        验证码有效期（分钟）
                      </label>
                      <input
                        id="setting-otp-expiry"
                        type="number"
                        min={1}
                        max={1440}
                        className="x-admin-input"
                        value={otpExpiryMinutes}
                        onChange={(e) =>
                          setOtpExpiryMinutes(parseInt(e.target.value, 10) || 10)
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="setting-max-images" className="form-label">
                        单帖最多图片数（1-4）
                      </label>
                      <input
                        id="setting-max-images"
                        type="number"
                        min={1}
                        max={4}
                        className="x-admin-input"
                        value={maxImagesPerPost}
                        onChange={(e) =>
                          setMaxImagesPerPost(parseInt(e.target.value, 10) || 4)
                        }
                      />
                    </div>
                  </div>

                  {settingsMsg && (
                    <div className="success-banner" role="status">
                      <CheckCircle2 size={15} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                      {settingsMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingSettings}
                  >
                    {savingSettings ? '保存中...' : '保存配置'}
                  </button>
                </form>

                <hr className="x-admin-divider" />

                <form onSubmit={handleSendTestEmail} className="x-admin-form">
                  <div className="x-admin-card-subheader">
                    <Mail size={16} />
                    <span>发送测试验证邮件</span>
                  </div>
                  <div className="x-admin-test-email-row">
                    <input
                      id="test-email-to"
                      type="email"
                      aria-label="测试收件邮箱"
                      className="x-admin-input"
                      placeholder="输入接收测试邮件的地址"
                      value={testToEmail}
                      onChange={(e) => setTestToEmail(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      disabled={sendingTestEmail}
                    >
                      <Send size={14} />
                      <span>{sendingTestEmail ? '发送中...' : '发送测试邮件'}</span>
                    </button>
                  </div>
                </form>
              </section>

              {/* Credentials Update Card */}
              <section className="x-admin-card">
                <div className="x-admin-card-header">
                  <KeyRound size={18} />
                  <h2>安全与管理员账号设置</h2>
                </div>

                <form onSubmit={handleUpdateCredentials} className="x-admin-form">
                  <div className="form-group">
                    <label htmlFor="cred-current-password" className="form-label">
                      当前密码
                    </label>
                    <input
                      id="cred-current-password"
                      type="password"
                      className="x-admin-input"
                      placeholder="请输入当前管理员密码"
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value);
                        if (credsError) setCredsError('');
                      }}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="cred-new-username" className="form-label">
                      新管理员用户名
                    </label>
                    <input
                      id="cred-new-username"
                      type="text"
                      className="x-admin-input"
                      placeholder="输入新用户名"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="cred-new-password" className="form-label">
                      新密码（至少 6 位）
                    </label>
                    <input
                      id="cred-new-password"
                      type="password"
                      minLength={6}
                      className="x-admin-input"
                      placeholder="输入新管理员密码"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (credsError) setCredsError('');
                      }}
                      required
                    />
                  </div>

                  {credsError && (
                    <div className="error-banner" role="alert">
                      {credsError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingCreds}
                  >
                    {savingCreds ? '更新中...' : '更新账号密码'}
                  </button>
                </form>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
