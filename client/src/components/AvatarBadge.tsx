import * as React from 'react';
import { cn, getAvatarGradient } from '@/lib/utils';

interface AvatarBadgeProps {
  nickname: string;
  seed: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarBadge({ nickname, seed, size = 'sm', className }: AvatarBadgeProps) {
  const initial = (nickname || 'U').trim().charAt(0).toUpperCase();
  const sizeClass =
    size === 'lg'
      ? 'h-10 w-10 text-sm'
      : size === 'md'
        ? 'h-8 w-8 text-xs'
        : 'h-6 w-6 text-[11px]';

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
