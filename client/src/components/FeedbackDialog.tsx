import * as React from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FeedbackCategory = 'feature' | 'ux' | 'bug';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

const CATEGORIES: ReadonlyArray<{ id: FeedbackCategory; label: string }> = [
  { id: 'feature', label: '功能建议' },
  { id: 'ux', label: '体验优化' },
  { id: 'bug', label: '问题反馈' },
];

export function FeedbackDialog({
  open,
  onOpenChange,
  onSubmitted,
}: FeedbackDialogProps) {
  const [category, setCategory] = React.useState<FeedbackCategory>('feature');
  const [content, setContent] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitted(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length < 4) {
      setError('请至少输入 4 个字的反馈描述');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          content: trimmed,
          pageRoute: window.location.pathname || '/',
          appVersion: '1.0.0',
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `提交失败 (${res.status})`);
      }
      setContent('');
      setSubmitted(true);
      onSubmitted?.();
      window.setTimeout(() => {
        onOpenChange(false);
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交反馈失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">意见反馈</DialogTitle>
          <DialogDescription>
            告诉我们你希望改进的细节或遇到的问题，有效建议会自动进入每日迭代队列。
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-sm font-semibold text-slate-900">反馈已提交成功</p>
            <p className="mt-1 text-xs text-slate-500">感谢帮助 dev社区 变得更好！</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-3 space-y-4">
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700">反馈类型</span>
              <div className="flex items-center gap-2">
                {CATEGORIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-xs font-semibold transition border',
                      category === item.id
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="community-feedback-textarea"
                  className="text-xs font-semibold text-slate-700"
                >
                  详细描述
                </label>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {content.length} / 1000
                </span>
              </div>
              <textarea
                id="community-feedback-textarea"
                rows={4}
                maxLength={1000}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="例如：希望动态详情页支持快捷键返回，或者反馈某个按钮样式/交互问题…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs font-medium text-red-600">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                variant="gradient"
                size="sm"
                disabled={submitting || content.trim().length < 4}
                className="px-4"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>{submitting ? '提交中…' : '提交反馈'}</span>
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
