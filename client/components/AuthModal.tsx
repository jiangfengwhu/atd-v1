import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { KeyRound, Loader2, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, setAuthToken } from '../api';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string | null;
  created_at: string;
}

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthenticated: (user: AuthenticatedUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onOpenChange,
  onAuthenticated,
}) => {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!open) {
      setErrorMsg('');
    }
  }, [open]);

  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('请输入有效的邮箱地址');
      return;
    }

    setSending(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<{
        sent: boolean;
        expires_in_seconds: number;
        cooldown_seconds: number;
      }>('/api/v1/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: trimmedEmail }),
      });

      setEmail(trimmedEmail);
      setCooldown(res.cooldown_seconds || 60);
      setStep('code');
      toast.success('验证码已发送至您的邮箱，请注意查收');
    } catch (err: any) {
      if (err?.code === '503_EMAIL_NOT_CONFIGURED') {
        setErrorMsg('邮件发信服务尚未配置，请稍后再试或联系站点管理员');
      } else {
        setErrorMsg(err?.message || '发送验证码失败');
      }
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorMsg('请输入 6 位数字验证码');
      return;
    }

    setVerifying(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<{
        token: string;
        user: AuthenticatedUser;
      }>('/api/v1/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: cleanCode }),
      });

      if (res.token) {
        setAuthToken(res.token);
      }
      toast.success(`欢迎回来，${res.user.email || res.user.username}`);
      onAuthenticated(res.user);
      onOpenChange(false);
      setStep('email');
      setCode('');
    } catch (err: any) {
      setErrorMsg(err?.message || '验证码校验失败');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="x-dialog-overlay" />
        <Dialog.Content className="x-dialog-content x-auth-dialog">
          <div className="x-dialog-header">
            <Dialog.Title className="x-dialog-title">
              邮箱验证码登录
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="x-dialog-close-btn"
                aria-label="关闭弹窗"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="x-dialog-desc">
            {step === 'email'
              ? '输入您的邮箱地址，我们将通过 Resend 发送 6 位一次性登录验证码。'
              : `验证码已发送至 ${email}，请在 10 分钟内完成验证。`}
          </Dialog.Description>

          {step === 'email' ? (
            <form onSubmit={handleSendCode} className="x-auth-form">
              <div className="x-auth-field">
                <label htmlFor="auth-email-input" className="x-auth-label">
                  邮箱地址
                </label>
                <div className="x-input-icon-wrap">
                  <Mail size={16} className="x-input-icon" />
                  <input
                    id="auth-email-input"
                    type="email"
                    className="x-auth-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    autoFocus
                    required
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="error-banner" role="alert">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary x-auth-submit"
                disabled={sending}
              >
                {sending ? (
                  <>
                    <Loader2 size={16} className="x-spin" />
                    <span>发送中...</span>
                  </>
                ) : (
                  '发送验证码'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="x-auth-form">
              <div className="x-auth-field">
                <label htmlFor="auth-otp-input" className="x-auth-label">
                  6 位验证码
                </label>
                <div className="x-input-icon-wrap">
                  <KeyRound size={16} className="x-input-icon" />
                  <input
                    id="auth-otp-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="x-auth-input x-otp-input"
                    placeholder="输入 6 位数字验证码"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      if (errorMsg) setErrorMsg('');
                    }}
                    autoFocus
                    required
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="error-banner" role="alert">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary x-auth-submit"
                disabled={verifying}
              >
                {verifying ? (
                  <>
                    <Loader2 size={16} className="x-spin" />
                    <span>验证中...</span>
                  </>
                ) : (
                  '验证并登录'
                )}
              </button>

              <div className="x-auth-secondary-actions">
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setErrorMsg('');
                  }}
                >
                  更换邮箱
                </button>
                <button
                  type="button"
                  className="btn-link"
                  disabled={cooldown > 0 || sending}
                  onClick={() => handleSendCode()}
                >
                  {cooldown > 0 ? `重新发送 (${cooldown}s)` : '重新发送验证码'}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
