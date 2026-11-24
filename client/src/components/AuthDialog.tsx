import * as React from 'react';
import { Loader2, Mail, Sparkles, KeyRound } from 'lucide-react';
import { api, ApiError, type UserProfile } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AuthDialogProps {
  open: boolean;
  mode?: 'login' | 'add';
  onOpenChange: (open: boolean) => void;
  onSuccess: (user: UserProfile) => void;
}

export function AuthDialog({ open, mode = 'login', onOpenChange, onSuccess }: AuthDialogProps) {
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [nickname, setNickname] = React.useState('');
  const [countdown, setCountdown] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [deliveryHint, setDeliveryHint] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  React.useEffect(() => {
    if (!open) {
      setError(null);
    } else if (mode === 'add') {
      setEmail('');
      setCode('');
      setNickname('');
      setDevCode(null);
      setDeliveryHint(null);
      setCountdown(0);
      setError(null);
    }
  }, [open, mode]);

  const handleSendCode = async () => {
    setError(null);
    setDeliveryHint(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('请输入邮箱地址');
      return;
    }

    setSending(true);
    try {
      const res = await api.sendCode(trimmed);
      setCountdown(60);
      if (res.deliveryMode === 'dev_fallback' && res.devCode) {
        setDevCode(res.devCode);
        setDeliveryHint('本地开发模式已生成验证码，可直接填入或输入上方数字。');
      } else {
        setDevCode(null);
        setDeliveryHint('验证码已通过 Resend 发送至你的邮箱，10 分钟内有效。');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发送验证码失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedEmail || !/^\d{6}$/.test(trimmedCode)) {
      setError('请输入有效邮箱和 6 位数字验证码');
      return;
    }

    setVerifying(true);
    try {
      const res = await api.verifyCode({
        email: trimmedEmail,
        code: trimmedCode,
        nickname: nickname.trim() || undefined,
      });
      setCode('');
      setDevCode(null);
      setDeliveryHint(null);
      onSuccess(res.user);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请检查验证码');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl">
            {mode === 'add' ? '添加其他账号' : '邮箱验证码登录'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? '验证另一个邮箱账号，即可在同一浏览器中随时一键切换身份。'
              : '无需记住密码，输入邮箱获取 6 位一次性验证码即可加入社区。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerify} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="auth-email" className="text-xs font-semibold text-zinc-700">
              邮箱地址
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="输入你的邮箱地址"
                  className="pl-9"
                  autoComplete="email"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleSendCode}
                disabled={sending || countdown > 0}
                className="shrink-0 rounded-xl px-4"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : countdown > 0 ? (
                  `${countdown}s`
                ) : (
                  '获取验证码'
                )}
              </Button>
            </div>
          </div>

          {devCode && (
            <div className="flex items-center justify-between rounded-2xl border border-dashed border-amber-300 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900">
              <div>
                <span className="font-semibold">本地调试验证码：</span>
                <code className="rounded bg-white px-2 py-0.5 font-mono text-sm font-bold text-blue-600">
                  {devCode}
                </code>
              </div>
              <button
                type="button"
                onClick={() => setCode(devCode)}
                className="rounded-full bg-amber-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-800"
              >
                一键填入
              </button>
            </div>
          )}

          {deliveryHint && !devCode && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {deliveryHint}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="auth-code" className="text-xs font-semibold text-zinc-700">
              6 位验证码
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                id="auth-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="输入 6 位验证码"
                className="pl-9 font-mono tracking-[0.25em]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="auth-nickname" className="text-xs font-semibold text-zinc-700">
              社区昵称 <span className="font-normal text-zinc-400">（首次注册可选）</span>
            </label>
            <Input
              id="auth-nickname"
              type="text"
              maxLength={30}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="起个好听的昵称吧"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="gradient"
            className="h-11 w-full rounded-xl text-sm"
            disabled={verifying}
          >
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在验证...
              </>
            ) : (
              '验证并登录'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
