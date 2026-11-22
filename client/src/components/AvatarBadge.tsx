import * as React from 'react';
import { cn, getAvatarGradient } from '@/lib/utils';

interface AvatarBadgeProps {
  nickname: string;
  seed: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function AvatarBadge({
  nickname,
  seed,
  avatarUrl,
  size = 'sm',
  className,
}: AvatarBadgeProps) {
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const initial = (nickname || 'U').trim().charAt(0).toUpperCase();
  const sizeClass =
    size === 'xl'
      ? 'h-20 w-20 text-2xl'
      : size === 'lg'
        ? 'h-10 w-10 text-sm'
        : size === 'md'
          ? 'h-8 w-8 text-xs'
          : 'h-6 w-6 text-[11px]';

  if (avatarUrl && !imgError) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 overflow-hidden rounded-full bg-zinc-100 shadow-sm ring-1 ring-black/5',
          sizeClass,
          className
        )}
      >
        <img
          src={avatarUrl}
          alt={nickname}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm',
        getAvatarGradient(seed || nickname),
        sizeClass,
        className
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
