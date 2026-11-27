import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfficialBadgeProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<OfficialBadgeProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function OfficialBadge({ label = '官方', size = 'sm', className }: OfficialBadgeProps) {
  return (
    <span
      data-testid="official-badge"
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center align-middle text-blue-600 dark:text-blue-400',
        className
      )}
    >
      <BadgeCheck className={cn('shrink-0', SIZE_CLASSES[size])} aria-hidden="true" />
    </span>
  );
}
