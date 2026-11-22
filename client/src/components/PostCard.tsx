import * as React from 'react';
import { Heart, MessageCircle, Hash } from 'lucide-react';
import type { PostItem } from '@/lib/api';
import { AvatarBadge } from '@/components/AvatarBadge';
import { cn, formatRelativeTime } from '@/lib/utils';

interface PostCardProps {
  post: PostItem;
  onOpen: (postId: string) => void;
  onToggleLike: (postId: string, e: React.MouseEvent) => void;
}

export function PostCard({ post, onOpen, onToggleLike }: PostCardProps) {
  const [imgError, setImgError] = React.useState(false);

  return (
    <article
      onClick={() => onOpen(post.id)}
      className="masonry-item group cursor-pointer overflow-hidden rounded-3xl border border-zinc-200/75 bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-soft"
    >
      {post.imageUrl && !imgError && (
        <div className="relative overflow-hidden bg-zinc-100">
          <img
            src={post.imageUrl}
            alt={post.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full max-h-96 object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      )}

      <div className="p-4 sm:p-5 space-y-3">
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 rounded-full bg-rose-50/90 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600"
              >
                <Hash className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <h3 className="line-clamp-2 text-base font-bold leading-snug text-zinc-900 group-hover:text-rose-600 transition-colors">
          {post.title}
        </h3>

        <p className="line-clamp-3 text-xs leading-relaxed text-zinc-500">{post.content}</p>

        <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
          <div className="flex min-w-0 items-center gap-2">
            <AvatarBadge
              nickname={post.author.nickname}
              seed={post.author.avatarSeed}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-zinc-700">{post.author.nickname}</p>
              <p className="text-[10px] text-zinc-400">{formatRelativeTime(post.createdAt)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              {post.commentsCount}
            </span>
            <button
              type="button"
              onClick={(e) => onToggleLike(post.id, e)}
              aria-label="点赞"
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors',
                post.likedByMe
                  ? 'bg-rose-50 text-rose-500 font-semibold'
                  : 'hover:bg-zinc-100 hover:text-zinc-700'
              )}
            >
              <Heart className={cn('h-3.5 w-3.5', post.likedByMe && 'fill-current')} />
              {post.likesCount}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
