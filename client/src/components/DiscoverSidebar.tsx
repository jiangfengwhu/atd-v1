import * as React from 'react';
import { Flame, Users, Hash, RefreshCw, UserPlus, UserCheck, Loader2 } from 'lucide-react';
import {
  api,
  ApiError,
  type RecommendedUserItem,
  type TrendingTopicItem,
  type UserProfile,
} from '@/lib/api';
import { AvatarBadge } from '@/components/AvatarBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DiscoverSidebarProps {
  currentUser: UserProfile | null;
  activeTag: string;
  refreshKey: number;
  onSelectTag: (tag: string) => void;
  onOpenUserProfile: (userId: string) => void;
  onRequireAuth: () => void;
}

export function DiscoverSidebar({
  currentUser,
  activeTag,
  refreshKey,
  onSelectTag,
  onOpenUserProfile,
  onRequireAuth,
}: DiscoverSidebarProps) {
  const [topics, setTopics] = React.useState<TrendingTopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = React.useState(true);
  const [topicsError, setTopicsError] = React.useState<string | null>(null);

  const [users, setUsers] = React.useState<RecommendedUserItem[]>([]);
  const [usersLoading, setUsersLoading] = React.useState(true);
  const [usersError, setUsersError] = React.useState<string | null>(null);
  const [followPendingId, setFollowPendingId] = React.useState<string | null>(null);

  const loadTopics = React.useCallback(async () => {
    setTopicsLoading(true);
    setTopicsError(null);
    try {
      const res = await api.getDiscoverTopics(8);
      setTopics(res.topics);
    } catch (err) {
      setTopicsError(err instanceof ApiError ? err.message : '加载热门话题失败');
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  const loadUsers = React.useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await api.getRecommendedUsers(5);
      setUsers(res.users);
    } catch (err) {
      setUsersError(err instanceof ApiError ? err.message : '加载推荐关注失败');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadTopics();
  }, [loadTopics, refreshKey]);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers, currentUser?.id, refreshKey]);

  const handleToggleFollow = async (targetId: string) => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setFollowPendingId(targetId);
    try {
      const res = await api.toggleFollow(targetId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetId
            ? {
                ...u,
                isFollowing: res.following,
                followersCount: res.followersCount,
              }
            : u
        )
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onRequireAuth();
      }
    } finally {
      setFollowPendingId(null);
    }
  };

  return (
    <aside
      aria-label="发现导航"
      className="hidden lg:block lg:w-[310px] lg:shrink-0 sticky top-0 self-start py-7 space-y-5"
    >
      {/* Trending Topics Card */}
      <section className="rounded-3xl border border-zinc-200/80 bg-white/95 p-5 shadow-card">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-zinc-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
              <Flame className="h-3.5 w-3.5" />
            </span>
            <span>热门话题</span>
          </h2>
          {activeTag && (
            <button
              type="button"
              onClick={() => onSelectTag('')}
              className="text-[11px] font-semibold text-rose-500 hover:text-rose-600"
            >
              重置筛选
            </button>
          )}
        </div>

        {topicsLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-2xl bg-zinc-100" />
            ))}
          </div>
        ) : topicsError ? (
          <div className="py-4 text-center">
            <p className="text-xs text-red-500">{topicsError}</p>
            <Button variant="outline" size="sm" onClick={loadTopics} className="mt-2 h-7 text-xs">
              <RefreshCw className="h-3 w-3" />
              重试
            </Button>
          </div>
        ) : topics.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400">暂无热门话题</p>
        ) : (
          <div className="space-y-1.5">
            {topics.map((topic, idx) => {
              const isSelected = activeTag === topic.tag;
              return (
                <button
                  key={topic.tag}
                  type="button"
                  onClick={() => onSelectTag(isSelected ? '' : topic.tag)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition',
                    isSelected
                      ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                      : 'hover:bg-zinc-50 text-zinc-800'
                  )}
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        idx < 3
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-zinc-100 text-zinc-500'
                      )}
                    >
                      {idx + 1}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-0.5 truncate text-xs font-bold">
                      <Hash className="h-3 w-3 shrink-0 opacity-70" />
                      <span className="truncate">{topic.tag}</span>
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
                    {topic.postsCount > 0 ? `${topic.postsCount} 篇动态` : '推荐'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Recommended Users Card */}
      <section className="rounded-3xl border border-zinc-200/80 bg-white/95 p-5 shadow-card">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-zinc-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
              <Users className="h-3.5 w-3.5" />
            </span>
            <span>推荐关注</span>
          </h2>
        </div>

        {usersLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-36 animate-pulse rounded bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        ) : usersError ? (
          <div className="py-4 text-center">
            <p className="text-xs text-red-500">{usersError}</p>
            <Button variant="outline" size="sm" onClick={loadUsers} className="mt-2 h-7 text-xs">
              <RefreshCw className="h-3 w-3" />
              重试
            </Button>
          </div>
        ) : users.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400">暂无更多推荐创作者</p>
        ) : (
          <ul className="space-y-3">
            {users.map((u) => {
              const pending = followPendingId === u.id;
              return (
                <li key={u.id} className="flex items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenUserProfile(u.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition-opacity hover:opacity-80"
                  >
                    <AvatarBadge
                      nickname={u.nickname}
                      seed={u.avatarSeed}
                      avatarUrl={u.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-zinc-900">{u.nickname}</p>
                      <p className="truncate text-[11px] text-zinc-400">
                        {u.bio || `${u.followersCount} 粉丝 · ${u.postsCount} 动态`}
                      </p>
                    </div>
                  </button>

                  <Button
                    type="button"
                    size="sm"
                    variant={u.isFollowing ? 'outline' : 'default'}
                    disabled={pending}
                    onClick={() => handleToggleFollow(u.id)}
                    className={cn(
                      'h-7 shrink-0 rounded-full px-3 text-[11px] font-semibold',
                      !u.isFollowing && 'bg-zinc-900 text-white hover:bg-zinc-800'
                    )}
                  >
                    {pending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : u.isFollowing ? (
                      <>
                        <UserCheck className="h-3 w-3" />
                        已关注
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3 w-3" />
                        关注
                      </>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
