import * as React from 'react';
import { Check, Copy, Link2, Send, Share, Share2 } from 'lucide-react';
import { api, type PostItem, type ShareChannel } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SharePostMenuProps {
  post: PostItem;
  placement?: 'down' | 'up';
  align?: 'left' | 'right';
  triggerVariant?: 'card' | 'detail';
  onShareViaDm: (post: PostItem) => void;
  onShareSuccess?: (postId: string, sharesCount: number, channel: ShareChannel) => void;
  onToast?: (message: string) => void;
}

function buildShareCopyText(post: PostItem, shareUrl: string): string {
  const normalized = post.content.replace(/\s+/g, ' ').trim();
  const preview = normalized.length > 100 ? `${normalized.slice(0, 100)}...` : normalized;
  return `${post.author.nickname} 在 dev社区 分享了一条动态：\n「${preview}」\n查看详情：${shareUrl}`;
}

export function SharePostMenu({
  post,
  placement = 'down',
  align = 'right',
  triggerVariant = 'card',
  onShareViaDm,
  onShareSuccess,
  onToast,
}: SharePostMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const markCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleChannelShare = async (channel: ShareChannel, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    setOpen(false);
    setPending(true);

    try {
      const res = await api.sharePost(post.id, channel);
      const shareUrl = `${window.location.origin}${res.sharePath}`;
      onShareSuccess?.(post.id, res.sharesCount, channel);

      if (channel === 'copy_link') {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl).catch(() => {});
        }
        markCopied();
        onToast?.('已复制分享链接');
      } else if (channel === 'copy_text') {
        const shareText = buildShareCopyText(post, shareUrl);
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText).catch(() => {});
        }
        markCopied();
        onToast?.('已复制分享文案');
      } else {
        const shareText = buildShareCopyText(post, shareUrl);
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          try {
            await navigator.share({
              title: `${post.author.nickname} 的社区动态`,
              text: post.content.slice(0, 120),
              url: shareUrl,
            });
            onToast?.('已完成分享');
            return;
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
              return;
            }
          }
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText).catch(() => {});
        }
        markCopied();
        onToast?.('已复制带摘要的分享链接，可粘贴分享给其他应用');
      }
    } catch {
      onToast?.('分享失败，请稍后重试');
    } finally {
      setPending(false);
    }
  };

  const handleDmOption = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    onShareViaDm(post);
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="分享"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={cn(
          triggerVariant === 'detail'
            ? 'inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            : 'inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors',
          copied
            ? triggerVariant === 'detail'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
              : 'bg-emerald-50 font-semibold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
            : triggerVariant === 'detail'
              ? ''
              : 'hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/60 dark:hover:text-blue-400'
        )}
      >
        {copied ? (
          <Check className={triggerVariant === 'detail' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        ) : (
          <Share2 className={triggerVariant === 'detail' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        )}
        <span className="tabular-nums">{copied ? '已复制' : post.sharesCount ?? 0}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="分享方式"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'absolute z-40 w-52 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900',
            placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-1.5',
            align === 'left' ? 'left-0' : 'right-0'
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleChannelShare('copy_link', e)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>复制链接</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleDmOption}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Send className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>通过私信发送</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleChannelShare('copy_text', e)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Copy className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>复制分享文案</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => handleChannelShare('external', e)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Share className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <span>更多方式分享</span>
          </button>
        </div>
      )}
    </div>
  );
}
