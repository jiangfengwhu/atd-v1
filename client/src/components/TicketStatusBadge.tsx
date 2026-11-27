import type { FeedbackTicketStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

export const TICKET_STATUS_META: Record<
  FeedbackTicketStatus,
  { label: string; className: string; dotClass: string }
> = {
  pending: {
    label: '待处理',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300',
    dotClass: 'bg-amber-500',
  },
  confirmed: {
    label: '已确认',
    className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-blue-300',
    dotClass: 'bg-blue-500',
  },
  in_progress: {
    label: '处理中',
    className: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-300',
    dotClass: 'bg-indigo-500',
  },
  launched: {
    label: '已上线',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
  },
  closed: {
    label: '已关闭',
    className: 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    dotClass: 'bg-zinc-400',
  },
};

interface TicketStatusBadgeProps {
  status: FeedbackTicketStatus;
  prefix?: string;
  testId?: string;
  className?: string;
}

export function TicketStatusBadge({
  status,
  prefix = '反馈工单 · ',
  testId = 'post-ticket-status',
  className,
}: TicketStatusBadgeProps) {
  const meta = TICKET_STATUS_META[status] ?? TICKET_STATUS_META.pending;
  return (
    <span
      data-testid={testId}
      data-ticket-status={status}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        meta.className,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} />
      <span>
        {prefix}
        {meta.label}
      </span>
    </span>
  );
}
