import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfficialBadgeProps {
  label?: string;
  className?: string;
}

export function OfficialBadge({ label = '官方', className }: OfficialBadgeProps) {
  return (
    <span
      data-testid="official-badge"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white',
        className
      )}
    >
      <BadgeCheck className="h-2.5 w-2.5" />
      <span>{label}</span>
    </span>
  );
}
