import * as React from 'react';
import {
  Heart,
  MessageCircle,
  Hash,
  Bookmark,
  Share2,
  Eye,
  Check,
} from 'lucide-react';
import type { PostItem } from '@/lib/api';
import { AvatarBadge } from '@/components/AvatarBadge';
import { cn, formatRelativeTime } from '@/lib/utils';

interface PostCardProps {
  post: PostItem;
  onOpen: (postId: string) => void;
  onToggleLike: (postId: string, e: React.MouseEvent) => void;
  onToggleBookmark?: (postId: string, e: React.MouseEvent) => void;
  onShare?: (postId: string, e: React.MouseEvent) => Promise<void> | void;
  onOpenAuthor?: (userId: string) => void;
  onSelectTag?: (tag: string, e: React.MouseEvent) => void;
}

export function PostCard({
  post,
  onOpen,
  onToggleLike,
  onToggleBookmark,
  onShare,
  onOpenAuthor,
  onSelectTag,
}: PostCardProps) {
  const [imgError, setImgError] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleShareClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onShare) return;
    await onShare(post.id, e);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article
      onClick={() => onOpen(post.id)}
      className="group cursor-pointer rounded-3xl border border-zinc-200/80 bg-white p-4 sm:p-5 shadow-card transition-all duration-200 hover:border-zinc-300/90 hover:shadow-soft"
    >
      <div className="flex gap-3 sm:gap-3.5">
        {/* Left Avatar Gutter (X.com timeline style) */}
        <button
          type="button"
          onClick={(e) => {
            if (onOpenAuthor) {
              e.stopPropagation();
              onOpenAuthor(post.author.id);
            }
          }}
          className="shrink-0 self-start transition-opacity hover:opacity-80"
          aria-label={`查看 ${post.author.nickname} 的主页`}
        >
          <AvatarBadge
            nickname={post.author.nickname}
            seed={post.author.avatarSeed}
            avatarUrl={post.author.avatarUrl}
            size="md"
          />
        </button>

        {/* Right Timeline Content Column */}
        <div className="min-w-0 flex-1 space-y-2.5">
          {/* Author + Timestamp */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={(e) => {
                if (onOpenAuthor) {
                  e.stopPropagation();
                  onOpenAuthor(post.author.id);
                }
              }}
              className="flex min-w-0 items-center gap-2 text-left hover:opacity-80 transition-opacity"
            >
              <span className="truncate text-sm font-bold text-zinc-900">
                {post.author.nickname}
              </span>
              <span className="shrink-0 text-xs text-zinc-400">
                · {formatRelativeTime(post.createdAt)}
              </span>
            </button>
          </div>

          {/* Post Title & Body */}
          <div className="space-y-1.5">
            <h3 className="text-[15px] sm:text-base font-bold leading-snug text-zinc-900 group-hover:text-rose-600 transition-colors">
              {post.title}
            </h3>
            <p className="line-clamp-4 whitespace-pre-wrap text-[13px] sm:text-sm leading-relaxed text-zinc-600">
              {post.content}
            </p>
          </div>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.slice(0, 4).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={(e) => {
                    if (onSelectTag) {
                      e.stopPropagation();
                      onSelectTag(tag, e);
                    }
                  }}
                  className="inline-flex items-center gap-0.5 rounded-full bg-rose-50/90 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-100"
                >
                  <Hash className="h-2.5 w-2.5" />
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Media Image */}
          {post.imageUrl && !imgError && (
            <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-100">
              <img
                src={post.imageUrl}
                alt={post.title}
                loading="lazy"
                onError={() => setImgError(true)}
                className="w-full max-h-[420px] object-cover transition-transform duration-500 group-hover:scale-[1.015]"
              />
            </div>
          )}

          {/* X.com Style Bottom Action Bar */}
          <div className="flex items-center justify-between pt-1.5 text-xs text-zinc-400">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(post.id);
              }}
              aria-label="评论"
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-sky-50 hover:text-sky-600"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="tabular-nums">{post.commentsCount}</span>
            </button>

            <button
              type="button"
              onClick={(e) => onToggleLike(post.id, e)}
              aria-label="点赞"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors',
                post.likedByMe
                  ? 'bg-rose-50 text-rose-500 font-semibold'
                  : 'hover:bg-rose-50 hover:text-rose-500'
              )}
            >
              <Heart className={cn('h-4 w-4', post.likedByMe && 'fill-current')} />
              <span className="tabular-nums">{post.likesCount}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                if (onToggleBookmark) {
                  onToggleBookmark(post.id, e);
                }
              }}
              aria-label={post.bookmarkedByMe ? '取消收藏' : '收藏'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors',
                post.bookmarkedByMe
                  ? 'bg-amber-50 text-amber-600 font-semibold'
                  : 'hover:bg-amber-50 hover:text-amber-600'
              )}
            >
              <Bookmark className={cn('h-4 w-4', post.bookmarkedByMe && 'fill-current')} />
              <span className="tabular-nums">{post.bookmarksCount ?? 0}</span>
            </button>

            <span
              title="点击数"
              aria-label={`点击 ${post.viewsCount ?? 0}`}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-zinc-400"
            >
              <Eye className="h-4 w-4" />
              <span className="tabular-nums">{post.viewsCount ?? 0}</span>
            </span>

            <button
              type="button"
              onClick={handleShareClick}
              aria-label="分享"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors',
                copied
                  ? 'bg-emerald-50 text-emerald-600 font-semibold'
                  : 'hover:bg-indigo-50 hover:text-indigo-600'
              )}
            >
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              <span className="tabular-nums">
                {copied ? '已复制' : post.sharesCount ?? 0}
              </span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
