import * as React from 'react';
import {
  Search,
  Sparkles,
  Plus,
  Flame,
  Clock,
  LogOut,
  RefreshCw,
  Image as ImageIcon,
  Hash,
} from 'lucide-react';
import { api, ApiError, type PostItem, type UserProfile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AvatarBadge } from '@/components/AvatarBadge';
import { PostCard } from '@/components/PostCard';
import { AuthDialog } from '@/components/AuthDialog';
import { ComposeDialog } from '@/components/ComposeDialog';
import { PostDetailDialog } from '@/components/PostDetailDialog';
import { ProfileDialog } from '@/components/ProfileDialog';
import { cn } from '@/lib/utils';

const FEATURED_TAGS = ['日常碎碎念', '摄影美学', '好物分享', '咖啡时光', '数码桌搭', '城市漫步'];

export function CommunityPage() {
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [siteName, setSiteName] = React.useState('拾光集 · 轻图文社区');
  const [posts, setPosts] = React.useState<PostItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [searchInput, setSearchInput] = React.useState('');
  const [activeQuery, setActiveQuery] = React.useState('');
  const [activeTag, setActiveTag] = React.useState('');
  const [sort, setSort] = React.useState<'latest' | 'hot'>('latest');

  const [authOpen, setAuthOpen] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [detailPostId, setDetailPostId] = React.useState<string | null>(null);

  const loadUser = React.useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me.authenticated ? me.user : null);
    } catch {
      setUser(null);
    }
  }, []);

  const loadPosts = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPosts({
        q: activeQuery || undefined,
        tag: activeTag || undefined,
        sort,
        limit: 36,
        offset: 0,
      });
      setPosts(res.posts);
      setTotal(res.total);
      if (res.siteName) {
        setSiteName(res.siteName);
        document.title = res.siteName;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载社区内容失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [activeQuery, activeTag, sort]);

  React.useEffect(() => {
    loadUser();
  }, [loadUser]);

  React.useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchInput.trim());
  };

  const handleOpenCompose = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setComposeOpen(true);
  };

  const handleToggleLike = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setAuthOpen(true);
      return;
    }
    try {
      const res = await api.toggleLike(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likedByMe: res.liked, likesCount: res.likesCount } : p
        )
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setAuthOpen(true);
      }
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    loadPosts();
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] relative overflow-x-hidden">
      {/* Subtle decorative pastel gradient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[420px] bg-[radial-gradient(ellipse_at_top_left,_rgba(244,63,94,0.10),_transparent_50%),radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.10),_transparent_50%)]"
      />

      {/* Sticky Glassmorphic Header — Zero /admin links */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setActiveQuery('');
              setActiveTag('');
            }}
            className="flex shrink-0 items-center gap-2.5 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-fuchsia-500 to-indigo-500 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="hidden text-base font-extrabold tracking-tight text-zinc-900 sm:inline">
              {siteName}
            </span>
          </button>

          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (!e.target.value.trim() && activeQuery) {
                  setActiveQuery('');
                }
              }}
              placeholder="搜索关键词、话题或灵感..."
              className="h-10 rounded-full border-zinc-200/80 bg-zinc-100/70 pl-10 pr-4 text-xs sm:text-sm focus:bg-white"
            />
          </form>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="gradient" size="sm" onClick={handleOpenCompose} className="h-9 px-4">
              <Plus className="h-4 w-4" />
              <span>发布图文</span>
            </Button>

            {user ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white py-1 pl-1.5 pr-3 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
                >
                  <AvatarBadge nickname={user.nickname} seed={user.avatarSeed} size="sm" />
                  <span className="hidden max-w-[90px] truncate sm:inline">{user.nickname}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  aria-label="退出登录"
                  title="退出登录"
                  className="h-9 w-9 text-zinc-500"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAuthOpen(true)}
                className="h-9 px-4"
              >
                登录
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Hero strip + Filter bar */}
        <section className="mb-7 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-600">
                <Sparkles className="h-3 w-3" />
                轻图文 · 慢生活灵感角落
              </p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
                把日常瞬间写成光
              </h1>
            </div>

            <div className="inline-flex self-start rounded-full border border-zinc-200/80 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setSort('latest')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                  sort === 'latest'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:text-zinc-900'
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                最新
              </button>
              <button
                type="button"
                onClick={() => setSort('hot')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                  sort === 'hot' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900'
                )}
              >
                <Flame className="h-3.5 w-3.5" />
                最热
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveTag('')}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition',
                activeTag === ''
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'border border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-50'
              )}
            >
              全部 ({total})
            </button>
            {FEATURED_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                  activeTag === tag
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'border border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-50'
                )}
              >
                <Hash className="h-3 w-3" />
                {tag}
              </button>
            ))}
          </div>
        </section>

        {/* Feed Content */}
        {loading ? (
          <div className="masonry-grid">
            {[180, 240, 150, 220, 190, 260].map((h, i) => (
              <div
                key={i}
                className="masonry-item overflow-hidden rounded-3xl border border-zinc-200/70 bg-white p-4 shadow-card"
              >
                <div
                  className="w-full animate-pulse rounded-2xl bg-zinc-200/70"
                  style={{ height: `${h}px` }}
                />
                <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-zinc-200/70" />
                <div className="mt-2 h-3 w-full animate-pulse rounded bg-zinc-100" />
                <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-red-100 bg-white py-16 px-6 text-center shadow-card">
            <p className="text-sm font-medium text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={loadPosts} className="mt-4">
              <RefreshCw className="h-3.5 w-3.5" />
              重新加载
            </Button>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300/80 bg-white/70 py-20 px-6 text-center">
            <div className="animate-float-slow flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-100 to-indigo-100 text-rose-500">
              <ImageIcon className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-zinc-900">
              {activeQuery || activeTag ? '没有找到匹配的图文' : '这里还是一片空白画布'}
            </h2>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-500">
              {activeQuery || activeTag
                ? '换个关键词或标签试试看，或者自己发布一篇相关的图文。'
                : '拍一张喜欢的照片、写下此刻的想法，成为社区第一批发光的记录者吧。'}
            </p>
            <div className="mt-5 flex gap-2.5">
              {(activeQuery || activeTag) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchInput('');
                    setActiveQuery('');
                    setActiveTag('');
                  }}
                >
                  清除筛选
                </Button>
              )}
              <Button variant="gradient" onClick={handleOpenCompose}>
                <Plus className="h-4 w-4" />
                发布第一篇图文
              </Button>
            </div>
          </div>
        ) : (
          <div className="masonry-grid">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onOpen={(id) => setDetailPostId(id)}
                onToggleLike={handleToggleLike}
              />
            ))}
          </div>
        )}
      </main>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          loadPosts();
        }}
      />

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onCreated={(newPost) => {
          setPosts((prev) => [newPost, ...prev]);
          setTotal((t) => t + 1);
        }}
      />

      <PostDetailDialog
        postId={detailPostId}
        currentUser={user}
        onClose={() => setDetailPostId(null)}
        onRequireAuth={() => setAuthOpen(true)}
        onPostUpdated={(updated) =>
          setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        }
        onPostDeleted={(deletedId) => {
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
          setTotal((t) => Math.max(0, t - 1));
        }}
      />

      <ProfileDialog
        open={profileOpen}
        user={user}
        onOpenChange={setProfileOpen}
        onUpdated={(updated) => {
          setUser(updated);
          loadPosts();
        }}
      />
    </div>
  );
}
