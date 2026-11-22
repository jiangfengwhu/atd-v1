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
  Compass,
  MessageSquare,
  User as UserIcon,
  ChevronUp,
  Settings,
  LogIn,
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
import { ProfileView } from '@/components/ProfileView';
import { MessagesView } from '@/components/MessagesView';
import { cn } from '@/lib/utils';

const FEATURED_TAGS = ['日常碎碎念', '摄影美学', '好物分享', '咖啡时光', '数码桌搭', '城市漫步'];

type ActiveNav = 'feed' | 'messages' | 'profile';

interface RouteState {
  view: ActiveNav;
  profileUserId: string | null;
}

function parsePathname(pathname: string): RouteState {
  if (pathname === '/messages') {
    return { view: 'messages', profileUserId: null };
  }
  if (pathname === '/profile') {
    return { view: 'profile', profileUserId: 'me' };
  }
  if (pathname.startsWith('/users/')) {
    const id = decodeURIComponent(pathname.slice('/users/'.length));
    if (id) {
      return { view: 'profile', profileUserId: id };
    }
  }
  return { view: 'feed', profileUserId: null };
}

export function CommunityPage() {
  const initialRoute = React.useMemo(() => parsePathname(window.location.pathname), []);

  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [authLoaded, setAuthLoaded] = React.useState(false);
  const [siteName, setSiteName] = React.useState('拾光集 · 轻图文社区');
  const [posts, setPosts] = React.useState<PostItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [activeNav, setActiveNav] = React.useState<ActiveNav>(initialRoute.view);
  const [viewingUserId, setViewingUserId] = React.useState<string | null>(
    initialRoute.profileUserId
  );
  const [messagePeerId, setMessagePeerId] = React.useState<string | null>(null);
  const [totalUnread, setTotalUnread] = React.useState(0);
  const [profileRefreshKey, setProfileRefreshKey] = React.useState(0);

  const [searchInput, setSearchInput] = React.useState('');
  const [activeQuery, setActiveQuery] = React.useState('');
  const [activeTag, setActiveTag] = React.useState('');
  const [sort, setSort] = React.useState<'latest' | 'hot'>('latest');

  const [authOpen, setAuthOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<(() => void) | null>(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [detailPostId, setDetailPostId] = React.useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);

  const syncUrl = React.useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  }, []);

  React.useEffect(() => {
    const onPopState = () => {
      const parsed = parsePathname(window.location.pathname);
      setActiveNav(parsed.view);
      setViewingUserId(parsed.profileUserId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const loadUnreadCount = React.useCallback(async (loggedInUser: UserProfile | null) => {
    if (!loggedInUser) {
      setTotalUnread(0);
      return;
    }
    try {
      const res = await api.listConversations();
      setTotalUnread(res.totalUnread);
    } catch {
      // Ignore transient polling failures
    }
  }, []);

  const loadUser = React.useCallback(async () => {
    try {
      const me = await api.me();
      const loadedUser = me.authenticated ? me.user : null;
      setUser(loadedUser);
      loadUnreadCount(loadedUser);
    } catch {
      setUser(null);
      setTotalUnread(0);
    } finally {
      setAuthLoaded(true);
    }
  }, [loadUnreadCount]);

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

  React.useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => loadUnreadCount(user), 15000);
    return () => window.clearInterval(timer);
  }, [user, loadUnreadCount]);

  const requireAuthThen = (action?: () => void) => {
    if (action) {
      setPendingAction(() => action);
    }
    setAuthOpen(true);
  };

  const goFeed = () => {
    setActiveNav('feed');
    setViewingUserId(null);
    setAccountMenuOpen(false);
    syncUrl('/');
  };

  const goMessages = (peerId?: string) => {
    setAccountMenuOpen(false);
    if (!user) {
      requireAuthThen(() => {
        setActiveNav('messages');
        if (peerId) setMessagePeerId(peerId);
        syncUrl('/messages');
      });
      return;
    }
    setActiveNav('messages');
    if (peerId) setMessagePeerId(peerId);
    syncUrl('/messages');
  };

  const goMyProfile = () => {
    setAccountMenuOpen(false);
    if (!user) {
      requireAuthThen(() => {
        setActiveNav('profile');
        setViewingUserId('me');
        syncUrl('/profile');
      });
      return;
    }
    setActiveNav('profile');
    setViewingUserId(user.id);
    syncUrl('/profile');
  };

  const goUserProfile = (targetId: string) => {
    setAccountMenuOpen(false);
    setActiveNav('profile');
    setViewingUserId(targetId);
    syncUrl(user && targetId === user.id ? '/profile' : `/users/${encodeURIComponent(targetId)}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchInput.trim());
    if (activeNav !== 'feed') {
      goFeed();
    }
  };

  const handleOpenCompose = () => {
    if (!user) {
      requireAuthThen(() => setComposeOpen(true));
      return;
    }
    setComposeOpen(true);
  };

  const handleToggleLike = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      requireAuthThen();
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
        requireAuthThen();
      }
    }
  };

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    await api.logout().catch(() => {});
    setUser(null);
    setTotalUnread(0);
    setMessagePeerId(null);
    if (activeNav === 'messages' || (activeNav === 'profile' && viewingUserId === 'me')) {
      goFeed();
    }
    loadPosts();
  };

  const resolvedProfileId =
    viewingUserId === 'me' ? user?.id ?? null : viewingUserId;

  return (
    <div className="min-h-screen bg-[#FAF8F5] relative overflow-x-hidden md:flex">
      {/* Subtle decorative pastel gradient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[420px] bg-[radial-gradient(ellipse_at_top_left,_rgba(244,63,94,0.10),_transparent_50%),radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.10),_transparent_50%)]"
      />

      {/* Desktop Left Sidebar — Zero /admin links */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:justify-between sticky top-0 z-30 h-screen border-r border-zinc-200/80 bg-white/85 px-4 py-5 backdrop-blur-xl">
        <div className="space-y-6">
          {/* Brand */}
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setActiveQuery('');
              setActiveTag('');
              goFeed();
            }}
            className="flex w-full items-center gap-2.5 px-2 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-fuchsia-500 to-indigo-500 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="truncate text-base font-extrabold tracking-tight text-zinc-900">
              {siteName}
            </span>
          </button>

          {/* Primary Navigation */}
          <nav aria-label="主导航" className="space-y-1.5">
            <button
              type="button"
              onClick={goFeed}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition',
                activeNav === 'feed'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              <Compass className="h-4 w-4" />
              <span>动态</span>
            </button>

            <button
              type="button"
              onClick={() => goMessages()}
              className={cn(
                'flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition',
                activeNav === 'messages'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              <span className="flex items-center gap-3">
                <MessageSquare className="h-4 w-4" />
                <span>私信</span>
              </span>
              {totalUnread > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={goMyProfile}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition',
                activeNav === 'profile'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              <UserIcon className="h-4 w-4" />
              <span>主页</span>
            </button>
          </nav>

          {/* Compose CTA */}
          <Button
            type="button"
            variant="gradient"
            onClick={handleOpenCompose}
            className="w-full h-10 justify-center shadow-md shadow-rose-500/20"
          >
            <Plus className="h-4 w-4" />
            <span>发布图文</span>
          </Button>
        </div>

        {/* Bottom Profile Trigger & Popover Menu */}
        <div ref={accountMenuRef} className="relative pt-4 border-t border-zinc-100">
          {user ? (
            <>
              {accountMenuOpen && (
                <div
                  role="menu"
                  aria-label="个人资料选项"
                  className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-1.5 shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={goMyProfile}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                  >
                    <UserIcon className="h-3.5 w-3.5 text-zinc-500" />
                    查看主页
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setProfileOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
                  >
                    <Settings className="h-3.5 w-3.5 text-zinc-500" />
                    编辑资料
                  </button>
                  <div className="my-1 border-t border-zinc-100" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    退出登录
                  </button>
                </div>
              )}

              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                aria-label={`个人资料 ${user.nickname}`}
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-2.5 text-left transition hover:bg-zinc-100"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <AvatarBadge
                    nickname={user.nickname}
                    seed={user.avatarSeed}
                    avatarUrl={user.avatarUrl}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-zinc-900">{user.nickname}</p>
                    <p className="text-[11px] text-zinc-400">个人资料</p>
                  </div>
                </div>
                <ChevronUp
                  className={cn(
                    'h-4 w-4 shrink-0 text-zinc-400 transition-transform',
                    accountMenuOpen && 'rotate-180'
                  )}
                />
              </button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAuthOpen(true)}
              className="w-full h-10 justify-center"
            >
              <LogIn className="h-4 w-4" />
              登录 / 注册
            </Button>
          )}
        </div>
      </aside>

      {/* Right Content Column */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        {/* Mobile Top Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-zinc-200/70 bg-white/85 px-4 py-3 backdrop-blur-xl md:hidden">
          <button type="button" onClick={goFeed} className="flex items-center gap-2 text-left">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 via-fuchsia-500 to-indigo-500 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-sm font-extrabold text-zinc-900 truncate max-w-[140px]">
              {siteName}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <Button variant="gradient" size="sm" onClick={handleOpenCompose} className="h-8 px-3">
              <Plus className="h-3.5 w-3.5" />
              发布图文
            </Button>
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                aria-label="退出登录"
                className="rounded-full border border-zinc-200 bg-white p-1.5 text-zinc-600"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAuthOpen(true)} className="h-8">
                登录
              </Button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {activeNav === 'feed' && (
            <>
              {/* Search + Hero + Filter bar */}
              <section className="mb-7 space-y-5">
                <form onSubmit={handleSearchSubmit} className="relative max-w-xl">
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
                    className="h-10 rounded-full border-zinc-200/80 bg-white pl-10 pr-4 text-xs sm:text-sm shadow-sm"
                  />
                </form>

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
                        sort === 'hot'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-500 hover:text-zinc-900'
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
                      onOpenAuthor={goUserProfile}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeNav === 'messages' && (
            <>
              {user ? (
                <MessagesView
                  currentUser={user}
                  initialPeerId={messagePeerId}
                  onOpenUserProfile={goUserProfile}
                  onUnreadUpdated={setTotalUnread}
                />
              ) : authLoaded ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white/80 py-20 px-6 text-center">
                  <MessageSquare className="h-10 w-10 text-zinc-300" />
                  <h2 className="mt-4 text-lg font-bold text-zinc-900">登录后查看站内私信</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    使用邮箱验证码登录，即可与社区好友实时发送私信
                  </p>
                  <Button variant="gradient" className="mt-5" onClick={() => goMessages()}>
                    立即登录
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {activeNav === 'profile' && (
            <>
              {resolvedProfileId ? (
                <ProfileView
                  userId={resolvedProfileId}
                  currentUser={user}
                  refreshKey={profileRefreshKey}
                  onRequireAuth={() => requireAuthThen()}
                  onOpenEditProfile={() => setProfileOpen(true)}
                  onOpenPost={(id) => setDetailPostId(id)}
                  onOpenUserProfile={goUserProfile}
                  onStartMessage={(peerId) => goMessages(peerId)}
                  onCurrentUserUpdated={(updated) => {
                    setUser(updated);
                    setProfileRefreshKey((k) => k + 1);
                    loadPosts();
                  }}
                />
              ) : authLoaded ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white/80 py-20 px-6 text-center">
                  <UserIcon className="h-10 w-10 text-zinc-300" />
                  <h2 className="mt-4 text-lg font-bold text-zinc-900">登录后查看个人主页</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    管理个人头像、简介、关注与粉丝，以及历史互动记录
                  </p>
                  <Button variant="gradient" className="mt-5" onClick={goMyProfile}>
                    立即登录
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="移动端导航"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-zinc-200/80 bg-white/95 py-2 backdrop-blur-xl md:hidden"
      >
        <button
          type="button"
          onClick={goFeed}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold',
            activeNav === 'feed' ? 'text-rose-600' : 'text-zinc-500'
          )}
        >
          <Compass className="h-4 w-4" />
          <span>动态</span>
        </button>
        <button
          type="button"
          onClick={() => goMessages()}
          className={cn(
            'relative flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold',
            activeNav === 'messages' ? 'text-rose-600' : 'text-zinc-500'
          )}
        >
          <MessageSquare className="h-4 w-4" />
          <span>私信</span>
          {totalUnread > 0 && (
            <span className="absolute right-1.5 top-0.5 h-2 w-2 rounded-full bg-rose-500" />
          )}
        </button>
        <button
          type="button"
          onClick={goMyProfile}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold',
            activeNav === 'profile' ? 'text-rose-600' : 'text-zinc-500'
          )}
        >
          <UserIcon className="h-4 w-4" />
          <span>主页</span>
        </button>
      </nav>

      <AuthDialog
        open={authOpen}
        onOpenChange={(v) => {
          setAuthOpen(v);
          if (!v) setPendingAction(null);
        }}
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          loadUnreadCount(loggedUser);
          loadPosts();
          if (pendingAction) {
            const act = pendingAction;
            setPendingAction(null);
            act();
          }
        }}
      />

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onCreated={(newPost) => {
          setPosts((prev) => [newPost, ...prev]);
          setTotal((t) => t + 1);
          setProfileRefreshKey((k) => k + 1);
        }}
      />

      <PostDetailDialog
        postId={detailPostId}
        currentUser={user}
        onClose={() => setDetailPostId(null)}
        onRequireAuth={() => requireAuthThen()}
        onPostUpdated={(updated) => {
          setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setProfileRefreshKey((k) => k + 1);
        }}
        onPostDeleted={(deletedId) => {
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
          setTotal((t) => Math.max(0, t - 1));
          setProfileRefreshKey((k) => k + 1);
        }}
        onOpenAuthor={goUserProfile}
      />

      <ProfileDialog
        open={profileOpen}
        user={user}
        onOpenChange={setProfileOpen}
        onUpdated={(updated) => {
          setUser(updated);
          setProfileRefreshKey((k) => k + 1);
          loadPosts();
        }}
      />
    </div>
  );
}
