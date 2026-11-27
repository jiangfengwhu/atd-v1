import * as React from 'react';
import {
  Flame,
  Users,
  Hash,
  RefreshCw,
  UserPlus,
  UserCheck,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  type RecommendedUserItem,
  type TrendingTopicItem,
  type UserProfile,
} from '@/lib/api';
import { AvatarBadge } from '@/components/AvatarBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OfficialBadge } from '@/components/OfficialBadge';
import { cn } from '@/lib/utils';

interface DiscoverSidebarProps {
  currentUser: UserProfile | null;
  activeTag: string;
  refreshKey: number;
  searchInput: string;
  activeQuery: string;
  onSearchInputChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onClearSearch: () => void;
  onSelectTag: (tag: string) => void;
  onOpenUserProfile: (userId: string) => void;
  onRequireAuth: () => void;
}

export function DiscoverSidebar({
  currentUser,
  activeTag,
  refreshKey,
  searchInput,
  activeQuery,
  onSearchInputChange,
  onSearchSubmit,
  onClearSearch,
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
      className="hidden lg:block lg:w-[310px] lg:shrink-0 lg:h-full lg:overflow-y-auto py-5 space-y-4"
    >
      {/* Top Search Box */}
      <form onSubmit={onSearchSubmit} className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          placeholder="搜索关键词、#话题或动态..."
          aria-label="搜索动态"
          className="h-10 rounded-full border-slate-200/80 bg-white pl-10 pr-9 text-sm shadow-card focus:border-blue-500"
        />
        {(searchInput || activeQuery) && (
          <button
            type="button"
            onClick={onClearSearch}
            aria-label="清除搜索"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      {/* Trending Topics Card */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Flame className="h-3.5 w-3.5" />
            </span>
            <span>热门话题</span>
          </h2>
          {activeTag && (
            <button
              type="button"
              onClick={() => onSelectTag('')}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
            >
              重置筛选
            </button>
          )}
        </div>

        {topicsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-xl bg-slate-100" />
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
          <p className="py-4 text-center text-xs text-slate-400">暂无热门话题</p>
        ) : (
          <div className="space-y-1">
            {topics.map((topic, idx) => {
              const isSelected = activeTag === topic.tag;
              return (
                <button
                  key={topic.tag}
                  type="button"
                  onClick={() => onSelectTag(isSelected ? '' : topic.tag)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition',
                    isSelected
                      ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200'
                      : 'hover:bg-slate-50 text-slate-800'
                  )}
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold',
                        idx < 3
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      {idx + 1}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-0.5 truncate text-xs font-bold">
                      <Hash className="h-3 w-3 shrink-0 opacity-70" />
                      <span className="truncate">{topic.tag}</span>
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                    {topic.postsCount > 0 ? `${topic.postsCount} 篇动态` : '推荐'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Recommended Users Card */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Users className="h-3.5 w-3.5" />
            </span>
            <span>推荐关注</span>
          </h2>
        </div>

        {usersLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-36 animate-pulse rounded bg-slate-100" />
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
          <p className="py-4 text-center text-xs text-slate-400">暂无更多推荐作者</p>
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
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-slate-900">{u.nickname}</p>
                        {u.isOfficial && <OfficialBadge label={u.officialBadge} />}
                      </div>
                      <p className="truncate text-[11px] text-slate-400">
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
                      !u.isFollowing && 'bg-slate-900 text-white hover:bg-slate-800'
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
