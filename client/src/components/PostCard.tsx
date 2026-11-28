import * as React from 'react';
import {
  Heart,
  MessageCircle,
  Hash,
  Bookmark,
  Eye,
} from 'lucide-react';
import type { PostItem, ShareChannel } from '@/lib/api';
import { extractHashtagsFromContent } from '@/lib/hashtags';
import { getPrimaryPreviewUrl } from '@/lib/urlParser';
import { AvatarBadge } from '@/components/AvatarBadge';
import { HashtagText } from '@/components/HashtagText';
import { LinkPreview } from '@/components/LinkPreview';
import { OfficialBadge } from '@/components/OfficialBadge';
import { SharePostMenu } from '@/components/SharePostMenu';
import { TicketStatusBadge } from '@/components/TicketStatusBadge';
import { cn, formatRelativeTime } from '@/lib/utils';

interface PostCardProps {
  post: PostItem;
  onOpen: (postId: string) => void;
  onToggleLike: (postId: string, e: React.MouseEvent) => void;
  onToggleBookmark?: (postId: string, e: React.MouseEvent) => void;
  onShareViaDm?: (post: PostItem) => void;
  onPostShared?: (postId: string, sharesCount: number, channel: ShareChannel) => void;
  onToast?: (message: string) => void;
  onOpenAuthor?: (userId: string) => void;
  onSelectTag?: (tag: string, e: React.MouseEvent) => void;
}

export function PostCard({
  post,
  onOpen,
  onToggleLike,
  onToggleBookmark,
  onShareViaDm,
  onPostShared,
  onToast,
  onOpenAuthor,
  onSelectTag,
}: PostCardProps) {
  const [imgError, setImgError] = React.useState(false);

  const fallbackTags = React.useMemo(() => {
    if (!post.tags || post.tags.length === 0) return [];
    const inlineSet = new Set(extractHashtagsFromContent(post.content));
    return post.tags.filter((t) => !inlineSet.has(t));
  }, [post.content, post.tags]);

  const primaryPreviewUrl = React.useMemo(() => {
    if (post.imageUrl && !imgError) return null;
    return getPrimaryPreviewUrl(post.content);
  }, [post.content, post.imageUrl, imgError]);

  return (
    <article
      onClick={() => onOpen(post.id)}
      className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-card transition-all duration-150 hover:border-slate-300/90 hover:shadow-soft dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700"
    >
      <div className="flex gap-3">
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
        <div className="min-w-0 flex-1 space-y-2">
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
              className="flex min-w-0 items-center gap-1.5 text-left transition-opacity hover:opacity-80"
            >
              <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                {post.author.nickname}
              </span>
              {post.author.isOfficial && (
                <OfficialBadge label={post.author.officialBadge} />
              )}
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                · {formatRelativeTime(post.createdAt)}
              </span>
            </button>
            {post.feedbackTicket && (
              <TicketStatusBadge status={post.feedbackTicket.status} />
            )}
          </div>

          {/* Post Body with inline clickable #hashtags and @mentions */}
          <p className="line-clamp-5 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800 dark:text-slate-200">
            <HashtagText
              content={post.content}
              mentions={post.mentions}
              onSelectTag={onSelectTag}
              onSelectMention={(mention) => onOpenAuthor?.(mention.userId)}
            />
          </p>

          {/* Fallback Tags (for legacy posts whose tags weren't written inline) */}
          {fallbackTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {fallbackTags.slice(0, 4).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={(e) => {
                    if (onSelectTag) {
                      e.stopPropagation();
                      onSelectTag(tag, e);
                    }
                  }}
                  className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-50 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700"
                >
                  <Hash className="h-2.5 w-2.5" />
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Media Image */}
          {post.imageUrl && !imgError ? (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
              <img
                src={post.imageUrl}
                alt={post.content.slice(0, 40) || '动态配图'}
                loading="lazy"
                onError={() => setImgError(true)}
                className="w-full max-h-[400px] object-cover transition-transform duration-300 group-hover:scale-[1.01]"
              />
            </div>
          ) : primaryPreviewUrl ? (
            <LinkPreview url={primaryPreviewUrl} compact />
          ) : null}

          {/* X.com Style Bottom Action Bar */}
          <div className="flex items-center justify-between pt-0.5 text-xs text-slate-400 dark:text-slate-500">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(post.id);
              }}
              aria-label="评论"
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/60 dark:hover:text-blue-400"
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
                  ? 'bg-rose-50 text-rose-500 font-semibold dark:bg-rose-950/60 dark:text-rose-400'
                  : 'hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/60 dark:hover:text-rose-400'
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
                  ? 'bg-amber-50 text-amber-600 font-semibold dark:bg-amber-950/60 dark:text-amber-400'
                  : 'hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/60 dark:hover:text-amber-400'
              )}
            >
              <Bookmark className={cn('h-4 w-4', post.bookmarkedByMe && 'fill-current')} />
              <span className="tabular-nums">{post.bookmarksCount ?? 0}</span>
            </button>

            <span
              title="浏览数"
              aria-label={`浏览 ${post.viewsCount ?? 0}`}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-slate-400 dark:text-slate-500"
            >
              <Eye className="h-4 w-4" />
              <span className="tabular-nums">{post.viewsCount ?? 0}</span>
            </span>

            <SharePostMenu
              post={post}
              placement="down"
              align="right"
              triggerVariant="card"
              onShareViaDm={(targetPost) => onShareViaDm?.(targetPost)}
              onShareSuccess={(postId, sharesCount, channel) =>
                onPostShared?.(postId, sharesCount, channel)
              }
              onToast={onToast}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
