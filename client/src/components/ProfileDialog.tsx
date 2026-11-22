import * as React from 'react';
import { Loader2, UserCheck } from 'lucide-react';
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

interface ProfileDialogProps {
  open: boolean;
  user: UserProfile | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (user: UserProfile) => void;
}

export function ProfileDialog({ open, user, onOpenChange, onUpdated }: ProfileDialogProps) {
  const [nickname, setNickname] = React.useState(user?.nickname ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && user) {
      setNickname(user.nickname);
      setError(null);
    }
  }, [open, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      setError('昵称长度需在 1 到 30 个字符之间');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateProfile(trimmed);
      onUpdated(res.user);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '修改失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-white">
            <UserCheck className="h-5 w-5" />
          </div>
          <DialogTitle>个人资料设置</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="profile-nickname" className="text-xs font-semibold text-zinc-700">
              展示昵称
            </label>
            <Input
              id="profile-nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
              placeholder="输入新昵称"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              保存昵称
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
