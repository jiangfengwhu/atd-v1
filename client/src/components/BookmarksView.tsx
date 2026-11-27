import * as React from 'react';
import { Bookmark, Loader2, RefreshCw } from 'lucide-react';
import { api, ApiError, type PostItem, type UserProfile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PostCard } from '@/components/PostCard';

interface BookmarksViewProps {
  currentUser: UserProfile;
  refreshKey?: number;
  onOpenPost: (postId: string) => void;
  onOpenAuthor: (userId: string) => void;
  onSelectTag: (tag: string) => void;
  onSharePost: (postId: string, e: React.MouseEvent) => Promise<void> | void;
  onBookmarkChanged?: (postId: string, bookmarked: boolean, bookmarksCount: number) => void;
  onLikeChanged?: (postId: string, liked: boolean, likesCount: number) => void;
  onGoFeed: () => void;
}

export function BookmarksView({
  currentUser,
  refreshKey = 0,
  onOpenPost,
  onOpenAuthor,
  onSelectTag,
  onSharePost,
  onBookmarkChanged,
  onLikeChanged,
  onGoFeed,
}: BookmarksViewProps) {
  const [items, setItems] = React.useState<PostItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadBookmarks = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getUserActivity<PostItem>('me', 'bookmarks', 50, 0);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载收藏列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks, currentUser.id, refreshKey]);

  const handleToggleLike = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.toggleLike(postId);
      setItems((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likedByMe: res.liked, likesCount: res.likesCount } : p
        )
      );
      onLikeChanged?.(postId, res.liked, res.likesCount);
    } catch {
      // Ignore transient errors
    }
  };

  const handleToggleBookmark = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.toggleBookmark(postId);
      if (!res.bookmarked) {
        setItems((prev) => prev.filter((p) => p.id !== postId));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setItems((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, bookmarkedByMe: res.bookmarked, bookmarksCount: res.bookmarksCount }
              : p
          )
        );
      }
      onBookmarkChanged?.(postId, res.bookmarked, res.bookmarksCount);
    } catch {
      // Ignore transient errors
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-card dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <Bookmark className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-slate-900 sm:text-lg dark:text-slate-100">
              我的收藏
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">共 {total} 条已收藏的社区动态</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadBookmarks}
          className="h-8 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="flex h-56 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900/90">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-white py-14 px-6 text-center shadow-card dark:border-red-900/60 dark:bg-slate-900">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={loadBookmarks} className="mt-4">
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/80 py-20 px-6 text-center dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Bookmark className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">还没有收藏任何动态</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            在社区浏览到优质内容时点击收藏按钮，方便随时回看
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onGoFeed} className="mt-4">
            去逛逛动态
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpen={onOpenPost}
              onToggleLike={handleToggleLike}
              onToggleBookmark={handleToggleBookmark}
              onShare={onSharePost}
              onOpenAuthor={onOpenAuthor}
              onSelectTag={onSelectTag}
            />
          ))}
        </div>
      )}
    </div>
  );
}
