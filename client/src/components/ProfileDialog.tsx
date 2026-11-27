import * as React from 'react';
import { Camera, Loader2, UserCheck } from 'lucide-react';
import { api, ApiError, type UserProfile } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { AvatarBadge } from '@/components/AvatarBadge';
import { ImageCropDialog } from '@/components/ImageCropDialog';

interface ProfileDialogProps {
  open: boolean;
  user: UserProfile | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (user: UserProfile) => void;
}

export function ProfileDialog({ open, user, onOpenChange, onUpdated }: ProfileDialogProps) {
  const [nickname, setNickname] = React.useState(user?.nickname ?? '');
  const [bio, setBio] = React.useState(user?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatarUrl ?? '');
  const [cropSrc, setCropSrc] = React.useState<string | null>(null);
  const [cropFileName, setCropFileName] = React.useState('avatar.png');
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && user) {
      setNickname(user.nickname);
      setBio(user.bio ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
      setError(null);
    }
  }, [open, user]);

  React.useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const handleSelectAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropFileName(file.name || 'avatar.png');
    setCropSrc(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleCroppedAvatar = async (croppedFile: File) => {
    setUploadingAvatar(true);
    setError(null);
    try {
      const uploaded = await api.uploadImage(croppedFile);
      setAvatarUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '头像上传失败');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNick = nickname.trim();
    const trimmedBio = bio.trim();
    if (trimmedNick.length < 1 || trimmedNick.length > 30) {
      setError('昵称长度需在 1 到 30 个字符之间');
      return;
    }
    if (trimmedBio.length > 200) {
      setError('个人简介不能超过 200 个字符');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateProfile({
        nickname: trimmedNick,
        bio: trimmedBio,
        avatarUrl,
      });
      onUpdated(res.user);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '修改失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-white dark:bg-blue-600">
              <UserCheck className="h-5 w-5" />
            </div>
            <DialogTitle>个人资料设置</DialogTitle>
            <DialogDescription>{user?.email}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div className="flex items-center gap-4">
              <AvatarBadge
                nickname={nickname || user?.nickname || 'U'}
                seed={user?.avatarSeed || 'seed'}
                avatarUrl={avatarUrl}
                size="xl"
              />
              <div className="space-y-1.5">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                  {uploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  <span>{uploadingAvatar ? '上传中...' : '更换头像'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleSelectAvatarFile}
                    disabled={uploadingAvatar}
                    className="sr-only"
                  />
                </label>
                <p className="text-[11px] text-zinc-400 dark:text-slate-500">支持裁剪为圆形头像，大小不超过 2MB</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-nickname" className="text-xs font-semibold text-zinc-700 dark:text-slate-300">
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

            <div className="space-y-1.5">
              <label htmlFor="profile-bio" className="text-xs font-semibold text-zinc-700 dark:text-slate-300">
                个人简介
              </label>
              <Textarea
                id="profile-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="写一句自我介绍、兴趣爱好或生活签名..."
                className="min-h-[84px]"
              />
              <p className="text-right text-[11px] text-zinc-400 dark:text-slate-500">{bio.trim().length}/200</p>
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saving || uploadingAvatar}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                保存资料
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        mode="avatar"
        fileName={cropFileName}
        onClose={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        onConfirm={handleCroppedAvatar}
      />
    </>
  );
}
