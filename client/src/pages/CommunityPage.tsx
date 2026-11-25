import * as React from 'react';
import {
  Search,
  Terminal,
  Plus,
  Flame,
  Clock,
  LogOut,
  RefreshCw,
  Image as ImageIcon,
  Hash,
  Compass,
  Bell,
  MessageSquare,
  User as UserIcon,
  ChevronUp,
  Settings,
  LogIn,
  Check,
  UserPlus,
  X,
  Bookmark,
  Users,
  MessageSquarePlus,
} from 'lucide-react';
import {
  api,
  ApiError,
  type AccountSummary,
  type PostItem,
  type UserProfile,
} from '@/lib/api';
import { realtimeClient } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AvatarBadge } from '@/components/AvatarBadge';
import { PostCard } from '@/components/PostCard';
import { PostComposer } from '@/components/PostComposer';
import { DiscoverSidebar } from '@/components/DiscoverSidebar';
import { BookmarksView } from '@/components/BookmarksView';
import { AuthDialog } from '@/components/AuthDialog';
import { ComposeDialog } from '@/components/ComposeDialog';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import { PostDetailDialog } from '@/components/PostDetailDialog';
import { ProfileDialog } from '@/components/ProfileDialog';
import { ProfileView } from '@/components/ProfileView';
import { MessagesView } from '@/components/MessagesView';
import { NotificationsView } from '@/components/NotificationsView';
import { cn } from '@/lib/utils';

type ActiveNav = 'feed' | 'bookmarks' | 'notifications' | 'messages' | 'profile';
type FeedSort = 'latest' | 'hot' | 'following';

interface RouteState {
  view: ActiveNav;
  profileUserId: string | null;
  detailPostId: string | null;
}

function parsePathname(pathname: string): RouteState {
  if (pathname === '/bookmarks') {
    return { view: 'bookmarks', profileUserId: null, detailPostId: null };
  }
  if (pathname === '/notifications') {
    return { view: 'notifications', profileUserId: null, detailPostId: null };
  }
  if (pathname === '/messages') {
    return { view: 'messages', profileUserId: null, detailPostId: null };
  }
  if (pathname === '/profile') {
    return { view: 'profile', profileUserId: 'me', detailPostId: null };
  }
  if (pathname.startsWith('/users/')) {
    const id = decodeURIComponent(pathname.slice('/users/'.length));
    if (id) {
      return { view: 'profile', profileUserId: id, detailPostId: null };
    }
  }
  if (pathname.startsWith('/posts/')) {
    const id = decodeURIComponent(pathname.slice('/posts/'.length)).split('/')[0];
    if (id) {
      return { view: 'feed', profileUserId: null, detailPostId: id };
    }
  }
  return { view: 'feed', profileUserId: null, detailPostId: null };
}

export function CommunityPage() {
  const initialRoute = React.useMemo(() => parsePathname(window.location.pathname), []);

  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [accounts, setAccounts] = React.useState<AccountSummary[]>([]);
  const [authLoaded, setAuthLoaded] = React.useState(false);
  const [siteName, setSiteName] = React.useState('dev社区');
  const [posts, setPosts] = React.useState<PostItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [activeNav, setActiveNav] = React.useState<ActiveNav>(initialRoute.view);
  const [viewingUserId, setViewingUserId] = React.useState<string | null>(
    initialRoute.profileUserId
  );
  const [messagePeerId, setMessagePeerId] = React.useState<string | null>(null);
  const [messagesUnread, setMessagesUnread] = React.useState(0);
  const [notificationsUnread, setNotificationsUnread] = React.useState(0);
  const [profileRefreshKey, setProfileRefreshKey] = React.useState(0);
  const [bookmarksRefreshKey, setBookmarksRefreshKey] = React.useState(0);
  const [discoverRefreshKey, setDiscoverRefreshKey] = React.useState(0);

  const [searchInput, setSearchInput] = React.useState('');
  const [activeQuery, setActiveQuery] = React.useState('');
  const [activeTag, setActiveTag] = React.useState('');
  const [sort, setSort] = React.useState<FeedSort>('latest');

  const [authOpen, setAuthOpen] = React.useState(false);
  const [authMode, setAuthMode] = React.useState<'login' | 'add'>('login');
  const [pendingAction, setPendingAction] = React.useState<(() => void) | null>(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [detailPostId, setDetailPostId] = React.useState<string | null>(
    initialRoute.detailPostId
  );
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
  const [switchingAccountId, setSwitchingAccountId] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);

  const showToast = React.useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2400);
  }, []);

  const syncUrl = React.useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  }, []);

  const getBasePathForView = React.useCallback(
    (nav: ActiveNav, profileId: string | null, currentUserId?: string) => {
      if (nav === 'bookmarks') return '/bookmarks';
      if (nav === 'notifications') return '/notifications';
      if (nav === 'messages') return '/messages';
      if (nav === 'profile') {
        if (!profileId || profileId === 'me' || profileId === currentUserId) {
          return '/profile';
        }
        return `/users/${encodeURIComponent(profileId)}`;
      }
      return '/';
    },
    []
  );

  React.useEffect(() => {
    const onPopState = () => {
      const parsed = parsePathname(window.location.pathname);
      setActiveNav(parsed.view);
      setViewingUserId(parsed.profileUserId);
      setDetailPostId(parsed.detailPostId);
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

  const loadUnreadSummary = React.useCallback(async (loggedInUser: UserProfile | null) => {
    if (!loggedInUser) {
      setMessagesUnread(0);
      setNotificationsUnread(0);
      return;
    }
    try {
      const res = await api.getUnreadCount();
      setNotificationsUnread(res.notificationsUnread);
      setMessagesUnread(res.messagesUnread);
    } catch {
      // Ignore transient initialization failures
    }
  }, []);

  const refreshAccounts = React.useCallback(async () => {
    try {
      const res = await api.listAccounts();
      setAccounts(res.accounts);
    } catch {
      setAccounts([]);
    }
  }, []);

  const loadUser = React.useCallback(async () => {
    try {
      const [me, accountsRes] = await Promise.all([
        api.me(),
        api.listAccounts().catch(() => ({ activeUserId: null, accounts: [] as AccountSummary[] })),
      ]);
      const loadedUser = me.authenticated ? me.user : null;
      setUser(loadedUser);
      setAccounts(accountsRes.accounts);
      loadUnreadSummary(loadedUser);
    } catch {
      setUser(null);
      setAccounts([]);
      setMessagesUnread(0);
      setNotificationsUnread(0);
    } finally {
      setAuthLoaded(true);
    }
  }, [loadUnreadSummary]);

  const loadPosts = React.useCallback(async () => {
    if (sort === 'following') {
      if (!authLoaded) return;
      if (!user?.id) {
        setPosts([]);
        setTotal(0);
        setLoading(false);
        setError(null);
        return;
      }
    }

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
  }, [activeQuery, activeTag, sort, authLoaded, user?.id]);

  React.useEffect(() => {
    loadUser();
  }, [loadUser]);

  React.useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  React.useEffect(() => {
    if (!user?.id) {
      realtimeClient.disconnect();
      return;
    }
    realtimeClient.disconnect();
    realtimeClient.connect();
    const unsubscribe = realtimeClient.subscribe((event) => {
      if (event.type === 'notification:new' || event.type === 'notification:read') {
        setNotificationsUnread(event.unreadCount);
      } else if (event.type === 'dm:new' || event.type === 'dm:read') {
        setMessagesUnread(event.totalUnread);
      }
    });
    return () => {
      unsubscribe();
      realtimeClient.disconnect();
    };
  }, [user?.id]);

  React.useEffect(() => {
    return () => {
      realtimeClient.disconnect();
    };
  }, []);

  const requireAuthThen = (action?: () => void) => {
    if (action) {
      setPendingAction(() => action);
    }
    setAuthMode('login');
    setAuthOpen(true);
  };

  const openPostDetail = (postId: string) => {
    setDetailPostId(postId);
    syncUrl(`/posts/${encodeURIComponent(postId)}`);
  };

  const closePostDetail = () => {
    setDetailPostId(null);
    if (window.location.pathname.startsWith('/posts/')) {
      syncUrl(getBasePathForView(activeNav, viewingUserId, user?.id));
    }
  };

  const goFeed = () => {
    setActiveNav('feed');
    setViewingUserId(null);
    setAccountMenuOpen(false);
    syncUrl('/');
  };

  const goBookmarks = () => {
    setActiveNav('bookmarks');
    setViewingUserId(null);
    setAccountMenuOpen(false);
    syncUrl('/bookmarks');
  };

  const goNotifications = () => {
    setAccountMenuOpen(false);
    if (!user) {
      requireAuthThen(() => {
        setActiveNav('notifications');
        syncUrl('/notifications');
      });
      return;
    }
    setActiveNav('notifications');
    syncUrl('/notifications');
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

  const handleSearchInputChange = (val: string) => {
    setSearchInput(val);
    if (!val.trim() && activeQuery) {
      setActiveQuery('');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchInput.trim());
    if (activeNav !== 'feed') {
      goFeed();
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setActiveQuery('');
  };

  const handleSelectTagFromAnyView = (tag: string) => {
    setActiveTag((prev) => (prev === tag ? '' : tag));
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

  const handlePostCreated = (newPost: PostItem) => {
    setPosts((prev) => [newPost, ...prev]);
    setTotal((t) => t + 1);
    setProfileRefreshKey((k) => k + 1);
    setDiscoverRefreshKey((k) => k + 1);
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

  const handleToggleBookmark = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      requireAuthThen();
      return;
    }
    try {
      const res = await api.toggleBookmark(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, bookmarkedByMe: res.bookmarked, bookmarksCount: res.bookmarksCount }
            : p
        )
      );
      setBookmarksRefreshKey((k) => k + 1);
      setProfileRefreshKey((k) => k + 1);
      setDiscoverRefreshKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        requireAuthThen();
      }
    }
  };

  const handleSharePost = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.sharePost(postId);
      const shareUrl = `${window.location.origin}${res.sharePath}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl).catch(() => {});
      }
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, sharesCount: res.sharesCount } : p))
      );
      setDiscoverRefreshKey((k) => k + 1);
      showToast('已复制分享链接');
    } catch {
      showToast('分享失败，请稍后重试');
    }
  };

  const applyAccountTransition = (
    nextUser: UserProfile | null,
    nextAccounts: AccountSummary[],
    previousUserId?: string
  ) => {
    setUser(nextUser);
    setAccounts(nextAccounts);
    setMessagePeerId(null);
    loadUnreadSummary(nextUser);
    setDiscoverRefreshKey((k) => k + 1);
    setProfileRefreshKey((k) => k + 1);
    setBookmarksRefreshKey((k) => k + 1);

    if (!nextUser) {
      if (
        activeNav === 'messages' ||
        activeNav === 'notifications' ||
        (activeNav === 'profile' && (viewingUserId === 'me' || viewingUserId === previousUserId))
      ) {
        goFeed();
      }
    } else if (
      activeNav === 'profile' &&
      (viewingUserId === 'me' || viewingUserId === previousUserId)
    ) {
      setViewingUserId(nextUser.id);
      syncUrl('/profile');
    }
  };

  const handleSwitchAccount = async (targetUserId: string) => {
    setAccountMenuOpen(false);
    if (!user || targetUserId === user.id) return;
    setSwitchingAccountId(targetUserId);
    const previousUserId = user.id;
    try {
      realtimeClient.disconnect();
      const res = await api.switchAccount(targetUserId);
      applyAccountTransition(res.user, res.accounts, previousUserId);
      showToast(`已切换至账号：${res.user.nickname}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '切换账号失败');
      loadUser();
    } finally {
      setSwitchingAccountId(null);
    }
  };

  const handleLogout = async (options?: { userId?: string; all?: boolean }) => {
    setAccountMenuOpen(false);
    const previousUserId = user?.id;
    realtimeClient.disconnect();
    try {
      const res = await api.logout(options);
      applyAccountTransition(res.activeUser, res.accounts, previousUserId);
      if (res.activeUser) {
        showToast(`已切换至剩余账号：${res.activeUser.nickname}`);
      }
    } catch {
      applyAccountTransition(null, [], previousUserId);
    }
  };

  const resolvedProfileId =
    viewingUserId === 'me' ? user?.id ?? null : viewingUserId;

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-[#F8FAFC] text-slate-900">
      {/* Three-Column Independent Scroll Shell */}
      <div className="mx-auto flex min-h-screen md:h-full w-full max-w-[1320px] flex-col md:flex-row md:gap-5 md:px-6 lg:gap-7 lg:px-8">
        {/* Desktop Left Sidebar — Zero /admin links */}
        <aside className="hidden md:flex md:w-[232px] md:shrink-0 md:h-full md:flex-col md:justify-between py-5">
          {/* Scrollable Top Navigation Section */}
          <div className="min-h-0 flex-1 overflow-y-auto space-y-5 pr-1">
            {/* Brand */}
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setActiveQuery('');
                setActiveTag('');
                setSort('latest');
                goFeed();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1 text-left transition-opacity hover:opacity-85"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <Terminal className="h-4 w-4" />
              </span>
              <span className="truncate text-base font-extrabold tracking-tight text-slate-900">
                {siteName}
              </span>
            </button>

            {/* Primary Navigation */}
            <nav aria-label="主导航" className="space-y-1">
              <button
                type="button"
                onClick={goFeed}
                className={cn(
                  'flex w-full items-center gap-3.5 rounded-full px-4 py-2.5 text-[15px] font-semibold transition',
                  activeNav === 'feed'
                    ? 'bg-white text-slate-950 shadow-card ring-1 ring-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                )}
              >
                <Compass className={cn('h-5 w-5', activeNav === 'feed' && 'text-blue-600')} />
                <span>动态</span>
              </button>

              <button
                type="button"
                onClick={goBookmarks}
                className={cn(
                  'flex w-full items-center gap-3.5 rounded-full px-4 py-2.5 text-[15px] font-semibold transition',
                  activeNav === 'bookmarks'
                    ? 'bg-white text-slate-950 shadow-card ring-1 ring-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                )}
              >
                <Bookmark
                  className={cn('h-5 w-5', activeNav === 'bookmarks' && 'text-blue-600')}
                />
                <span>收藏</span>
              </button>

              <button
                type="button"
                onClick={goNotifications}
                className={cn(
                  'flex w-full items-center justify-between rounded-full px-4 py-2.5 text-[15px] font-semibold transition',
                  activeNav === 'notifications'
                    ? 'bg-white text-slate-950 shadow-card ring-1 ring-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                )}
              >
                <span className="flex items-center gap-3.5">
                  <Bell
                    className={cn('h-5 w-5', activeNav === 'notifications' && 'text-blue-600')}
                  />
                  <span>通知</span>
                </span>
                {notificationsUnread > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {notificationsUnread > 99 ? '99+' : notificationsUnread}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => goMessages()}
                className={cn(
                  'flex w-full items-center justify-between rounded-full px-4 py-2.5 text-[15px] font-semibold transition',
                  activeNav === 'messages'
                    ? 'bg-white text-slate-950 shadow-card ring-1 ring-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                )}
              >
                <span className="flex items-center gap-3.5">
                  <MessageSquare
                    className={cn('h-5 w-5', activeNav === 'messages' && 'text-blue-600')}
                  />
                  <span>私信</span>
                </span>
                {messagesUnread > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {messagesUnread > 99 ? '99+' : messagesUnread}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={goMyProfile}
                className={cn(
                  'flex w-full items-center gap-3.5 rounded-full px-4 py-2.5 text-[15px] font-semibold transition',
                  activeNav === 'profile'
                    ? 'bg-white text-slate-950 shadow-card ring-1 ring-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                )}
              >
                <UserIcon className={cn('h-5 w-5', activeNav === 'profile' && 'text-blue-600')} />
                <span>主页</span>
              </button>
            </nav>

            {/* Compose CTA */}
            <Button
              type="button"
              variant="gradient"
              onClick={handleOpenCompose}
              className="w-full h-10 rounded-full justify-center text-sm font-bold"
            >
              <Plus className="h-4 w-4" />
              <span>发布动态</span>
            </Button>

            {/* User Feedback Trigger */}
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-600 shadow-xs transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-blue-600" />
              <span>意见反馈</span>
            </button>
          </div>

          {/* Bottom Profile Trigger & Multi-Account Popover Menu (outside scrollable nav so never clipped) */}
          <div ref={accountMenuRef} className="relative shrink-0 pt-3">
            {user ? (
              <>
                {accountMenuOpen && (
                  <div
                    role="menu"
                    aria-label="个人资料选项"
                    className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
                  >
                    {accounts.length > 0 && (
                      <div className="mb-1">
                        <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          切换账号 ({accounts.length}/5)
                        </p>
                        <div className="max-h-44 space-y-0.5 overflow-y-auto">
                          {accounts.map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              role="menuitem"
                              disabled={switchingAccountId === acc.id}
                              onClick={() => handleSwitchAccount(acc.id)}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition',
                                acc.isActive
                                  ? 'bg-blue-50 text-slate-900'
                                  : 'text-slate-700 hover:bg-slate-100'
                              )}
                            >
                              <AvatarBadge
                                nickname={acc.nickname}
                                seed={acc.avatarSeed}
                                avatarUrl={acc.avatarUrl}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-900">
                                  {acc.nickname}
                                </p>
                                <p className="truncate text-[10px] text-slate-400">{acc.email}</p>
                              </div>
                              {acc.isActive && (
                                <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="my-1 border-t border-slate-100" />
                      </div>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setAuthMode('add');
                        setAuthOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <UserPlus className="h-3.5 w-3.5 text-slate-500" />
                      添加其他账号
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={goMyProfile}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <UserIcon className="h-3.5 w-3.5 text-slate-500" />
                      查看主页
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setProfileOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <Settings className="h-3.5 w-3.5 text-slate-500" />
                      编辑资料
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    {accounts.length > 1 ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleLogout({})}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          退出当前账号
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleLogout({ all: true })}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          退出全部账号
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleLogout({})}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        退出登录
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  aria-label={`个人资料 ${user.nickname}`}
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-2 text-left shadow-card transition hover:border-slate-300"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AvatarBadge
                      nickname={user.nickname}
                      seed={user.avatarSeed}
                      avatarUrl={user.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900">{user.nickname}</p>
                      <p className="text-[11px] text-slate-400">
                        {accounts.length > 1 ? `个人资料 · ${accounts.length}账号` : '个人资料'}
                      </p>
                    </div>
                  </div>
                  <ChevronUp
                    className={cn(
                      'h-4 w-4 shrink-0 text-slate-400 transition-transform',
                      accountMenuOpen && 'rotate-180'
                    )}
                  />
                </button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAuthMode('login');
                  setAuthOpen(true);
                }}
                className="w-full h-10 rounded-full justify-center bg-white shadow-card"
              >
                <LogIn className="h-4 w-4" />
                登录 / 注册
              </Button>
            )}
          </div>
        </aside>

        {/* Center + Right Columns */}
        <div className="flex min-w-0 flex-1 flex-col md:h-full md:min-h-0 pb-20 md:pb-0">
          {/* Mobile Top Bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-xl md:hidden">
            <button type="button" onClick={goFeed} className="flex items-center gap-2 text-left">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Terminal className="h-4 w-4" />
              </span>
              <span className="text-sm font-extrabold text-slate-900 truncate max-w-[140px]">
                {siteName}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                aria-label="意见反馈"
                title="意见反馈"
                className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-blue-600"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
              <Button variant="gradient" size="sm" onClick={handleOpenCompose} className="h-8 px-3">
                <Plus className="h-3.5 w-3.5" />
                发布动态
              </Button>
              {user ? (
                <button
                  type="button"
                  onClick={() => handleLogout({})}
                  aria-label="退出登录"
                  className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-600"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthOpen(true);
                  }}
                  className="h-8"
                >
                  登录
                </Button>
              )}
            </div>
          </header>

          <div
            className={cn(
              'flex flex-1 min-h-0 items-start md:h-full',
              activeNav === 'feed' && 'lg:gap-6'
            )}
          >
            {/* Independently Scrollable Center Content Column */}
            <main
              className={cn(
                'w-full min-w-0 flex-1 md:h-full md:overflow-y-auto px-4 pb-8 md:px-0',
                activeNav === 'feed' || activeNav === 'bookmarks' ? 'max-w-[660px]' : 'max-w-4xl'
              )}
            >
              {activeNav === 'feed' && (
                <>
                  {/* Sticky Full-Width X.com Style Tab Bar */}
                  <div className="sticky top-0 z-20 w-full bg-[#F8FAFC]/95 pt-5 pb-2.5 backdrop-blur-md">
                    <div
                      role="tablist"
                      aria-label="动态流排序"
                      className="grid w-full grid-cols-3 rounded-2xl border border-slate-200/80 bg-white p-1 shadow-card"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sort === 'latest'}
                        onClick={() => setSort('latest')}
                        className={cn(
                          'relative inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-semibold transition',
                          sort === 'latest'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>最新</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sort === 'hot'}
                        onClick={() => setSort('hot')}
                        className={cn(
                          'relative inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-semibold transition',
                          sort === 'hot'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                      >
                        <Flame className="h-3.5 w-3.5" />
                        <span>最热</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sort === 'following'}
                        onClick={() => setSort('following')}
                        className={cn(
                          'relative inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-semibold transition',
                          sort === 'following'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>我的关注</span>
                      </button>
                    </div>
                  </div>

                  {/* Mobile / Tablet Search Fallback (desktop search lives at top of right sidebar) */}
                  <form onSubmit={handleSearchSubmit} className="relative mb-3 lg:hidden">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchInput}
                      onChange={(e) => handleSearchInputChange(e.target.value)}
                      placeholder="搜索关键词、#话题或动态..."
                      className="h-9 rounded-full border-slate-200 bg-white pl-10 pr-8 text-xs shadow-card"
                    />
                    {(searchInput || activeQuery) && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        aria-label="清除搜索"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </form>

                  {/* X.com Inline Titleless Post Composer */}
                  {user && sort !== 'following' && (
                    <div className="mb-3">
                      <PostComposer
                        currentUser={user}
                        compact
                        onCreated={handlePostCreated}
                      />
                    </div>
                  )}

                  {/* Active Filter Indicator */}
                  {(activeTag || activeQuery) && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200/80 bg-blue-50/60 px-3.5 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2 text-slate-700">
                        <span className="font-semibold">当前筛选：</span>
                        {activeTag && (
                          <button
                            type="button"
                            onClick={() => setActiveTag('')}
                            className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 font-semibold text-white"
                          >
                            <Hash className="h-3 w-3" />
                            {activeTag}
                            <X className="h-3 w-3" />
                          </button>
                        )}
                        {activeQuery && (
                          <button
                            type="button"
                            onClick={handleClearSearch}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 font-semibold text-white"
                          >
                            <Search className="h-3 w-3" />
                            {activeQuery}
                            <X className="h-3 w-3" />
                          </button>
                        )}
                        <span className="text-slate-500">共 {total} 条动态</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInput('');
                          setActiveQuery('');
                          setActiveTag('');
                        }}
                        className="font-semibold text-blue-600 hover:text-blue-700"
                      >
                        清除全部
                      </button>
                    </div>
                  )}

                  {/* Feed Content */}
                  {sort === 'following' && authLoaded && !user ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 py-20 px-6 text-center">
                      <Users className="h-10 w-10 text-slate-300" />
                      <h2 className="mt-4 text-lg font-bold text-slate-900">
                        登录后查看「我的关注」动态
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        关注感兴趣的开发者，在这里集中浏览他们的最新分享
                      </p>
                      <Button
                        variant="gradient"
                        className="mt-5"
                        onClick={() => requireAuthThen()}
                      >
                        立即登录
                      </Button>
                    </div>
                  ) : loading ? (
                    <div className="space-y-2.5">
                      {[140, 180, 120, 160].map((h, i) => (
                        <div
                          key={i}
                          className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200/70" />
                            <div className="h-3.5 w-28 animate-pulse rounded bg-slate-200/70" />
                          </div>
                          <div className="mt-3 h-3.5 w-3/4 animate-pulse rounded bg-slate-200/70" />
                          <div
                            className="mt-3 w-full animate-pulse rounded-xl bg-slate-100"
                            style={{ height: `${h}px` }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-white py-16 px-6 text-center shadow-card">
                      <p className="text-sm font-medium text-red-600">{error}</p>
                      <Button variant="outline" size="sm" onClick={loadPosts} className="mt-4">
                        <RefreshCw className="h-3.5 w-3.5" />
                        重新加载
                      </Button>
                    </div>
                  ) : posts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/80 py-20 px-6 text-center">
                      <div className="animate-float-slow flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                      <h2 className="mt-4 text-base font-bold text-slate-900">
                        {sort === 'following'
                          ? '关注的作者暂未发布动态'
                          : activeQuery || activeTag
                            ? '没有找到匹配的动态'
                            : '这里还是一片空白'}
                      </h2>
                      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
                        {sort === 'following'
                          ? '去「最新」或右侧「推荐关注」发现更多值得关注的创作者吧。'
                          : activeQuery || activeTag
                            ? '换个关键词或标签试试看，或者发布一条相关动态。'
                            : '写下你的代码心得、架构思考或生活片段，成为社区的第一批分享者。'}
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
                        {sort === 'following' ? (
                          <Button variant="outline" onClick={() => setSort('latest')}>
                            浏览最新动态
                          </Button>
                        ) : (
                          <Button variant="gradient" onClick={handleOpenCompose}>
                            <Plus className="h-4 w-4" />
                            发布第一条动态
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {posts.map((post) => (
                        <PostCard
                          key={post.id}
                          post={post}
                          onOpen={openPostDetail}
                          onToggleLike={handleToggleLike}
                          onToggleBookmark={handleToggleBookmark}
                          onShare={handleSharePost}
                          onOpenAuthor={goUserProfile}
                          onSelectTag={(tag) => setActiveTag(activeTag === tag ? '' : tag)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeNav === 'bookmarks' && (
                <div className="pt-5">
                  {user ? (
                    <BookmarksView
                      currentUser={user}
                      refreshKey={bookmarksRefreshKey}
                      onOpenPost={openPostDetail}
                      onOpenAuthor={goUserProfile}
                      onSelectTag={handleSelectTagFromAnyView}
                      onSharePost={handleSharePost}
                      onGoFeed={goFeed}
                      onBookmarkChanged={(postId, bookmarked, bookmarksCount) => {
                        setPosts((prev) =>
                          prev.map((p) =>
                            p.id === postId
                              ? { ...p, bookmarkedByMe: bookmarked, bookmarksCount }
                              : p
                          )
                        );
                        setProfileRefreshKey((k) => k + 1);
                        setDiscoverRefreshKey((k) => k + 1);
                      }}
                      onLikeChanged={(postId, liked, likesCount) => {
                        setPosts((prev) =>
                          prev.map((p) =>
                            p.id === postId
                              ? { ...p, likedByMe: liked, likesCount }
                              : p
                          )
                        );
                      }}
                    />
                  ) : authLoaded ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 py-20 px-6 text-center">
                      <Bookmark className="h-10 w-10 text-slate-300" />
                      <h2 className="mt-4 text-lg font-bold text-slate-900">
                        登录后查看个人收藏
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        保存你喜欢的技术文章与动态，随时在收藏页集中回顾
                      </p>
                      <Button
                        variant="gradient"
                        className="mt-5"
                        onClick={() => requireAuthThen()}
                      >
                        立即登录
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              {activeNav === 'notifications' && (
                <div className="pt-5">
                  {user ? (
                    <NotificationsView
                      onUnreadUpdated={setNotificationsUnread}
                      onOpenPost={openPostDetail}
                      onOpenUserProfile={goUserProfile}
                    />
                  ) : authLoaded ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 py-20 px-6 text-center">
                      <Bell className="h-10 w-10 text-slate-300" />
                      <h2 className="mt-4 text-lg font-bold text-slate-900">登录后查看通知中心</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        实时接收好友的点赞、评论与新增关注提醒
                      </p>
                      <Button variant="gradient" className="mt-5" onClick={goNotifications}>
                        立即登录
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              {activeNav === 'messages' && (
                <div className="pt-5">
                  {user ? (
                    <MessagesView
                      currentUser={user}
                      initialPeerId={messagePeerId}
                      onOpenUserProfile={goUserProfile}
                      onUnreadUpdated={setMessagesUnread}
                    />
                  ) : authLoaded ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 py-20 px-6 text-center">
                      <MessageSquare className="h-10 w-10 text-slate-300" />
                      <h2 className="mt-4 text-lg font-bold text-slate-900">登录后查看站内私信</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        使用邮箱验证码登录，即可与社区好友实时发送私信
                      </p>
                      <Button variant="gradient" className="mt-5" onClick={() => goMessages()}>
                        立即登录
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              {activeNav === 'profile' && (
                <div className="pt-5">
                  {resolvedProfileId ? (
                    <ProfileView
                      userId={resolvedProfileId}
                      currentUser={user}
                      refreshKey={profileRefreshKey}
                      onRequireAuth={() => requireAuthThen()}
                      onOpenEditProfile={() => setProfileOpen(true)}
                      onOpenPost={openPostDetail}
                      onOpenUserProfile={goUserProfile}
                      onStartMessage={(peerId) => goMessages(peerId)}
                      onCurrentUserUpdated={(updated) => {
                        setUser(updated);
                        setProfileRefreshKey((k) => k + 1);
                        loadPosts();
                      }}
                    />
                  ) : authLoaded ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 py-20 px-6 text-center">
                      <UserIcon className="h-10 w-10 text-slate-300" />
                      <h2 className="mt-4 text-lg font-bold text-slate-900">登录后查看个人主页</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        管理个人头像、简介、关注与粉丝，以及历史互动记录
                      </p>
                      <Button variant="gradient" className="mt-5" onClick={goMyProfile}>
                        立即登录
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </main>

            {activeNav === 'feed' && (
              <DiscoverSidebar
                currentUser={user}
                activeTag={activeTag}
                refreshKey={discoverRefreshKey}
                searchInput={searchInput}
                activeQuery={activeQuery}
                onSearchInputChange={handleSearchInputChange}
                onSearchSubmit={handleSearchSubmit}
                onClearSearch={handleClearSearch}
                onSelectTag={(tag) => setActiveTag(tag)}
                onOpenUserProfile={goUserProfile}
                onRequireAuth={() => requireAuthThen()}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="移动端导航"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200/80 bg-white/95 py-2 backdrop-blur-xl md:hidden"
      >
        <button
          type="button"
          onClick={goFeed}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold',
            activeNav === 'feed' ? 'text-blue-600' : 'text-slate-500'
          )}
        >
          <Compass className="h-4 w-4" />
          <span>动态</span>
        </button>
        <button
          type="button"
          onClick={goBookmarks}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold',
            activeNav === 'bookmarks' ? 'text-blue-600' : 'text-slate-500'
          )}
        >
          <Bookmark className="h-4 w-4" />
          <span>收藏</span>
        </button>
        <button
          type="button"
          onClick={goNotifications}
          className={cn(
            'relative flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold',
            activeNav === 'notifications' ? 'text-blue-600' : 'text-slate-500'
          )}
        >
          <Bell className="h-4 w-4" />
          <span>通知</span>
          {notificationsUnread > 0 && (
            <span className="absolute right-1.5 top-0.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => goMessages()}
          className={cn(
            'relative flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold',
            activeNav === 'messages' ? 'text-blue-600' : 'text-slate-500'
          )}
        >
          <MessageSquare className="h-4 w-4" />
          <span>私信</span>
          {messagesUnread > 0 && (
            <span className="absolute right-1.5 top-0.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
        <button
          type="button"
          onClick={goMyProfile}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold',
            activeNav === 'profile' ? 'text-blue-600' : 'text-slate-500'
          )}
        >
          <UserIcon className="h-4 w-4" />
          <span>主页</span>
        </button>
      </nav>

      <AuthDialog
        open={authOpen}
        mode={authMode}
        onOpenChange={(v) => {
          setAuthOpen(v);
          if (!v) setPendingAction(null);
        }}
        onSuccess={(loggedUser) => {
          const previousUserId = user?.id;
          realtimeClient.disconnect();
          setUser(loggedUser);
          refreshAccounts();
          loadUnreadSummary(loggedUser);
          setDiscoverRefreshKey((k) => k + 1);
          setProfileRefreshKey((k) => k + 1);
          setBookmarksRefreshKey((k) => k + 1);
          if (
            activeNav === 'profile' &&
            (viewingUserId === 'me' || viewingUserId === previousUserId)
          ) {
            setViewingUserId(loggedUser.id);
            syncUrl('/profile');
          }
          if (pendingAction) {
            const act = pendingAction;
            setPendingAction(null);
            act();
          }
        }}
      />

      <ComposeDialog
        open={composeOpen}
        currentUser={user}
        onOpenChange={setComposeOpen}
        onCreated={handlePostCreated}
      />

      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        onSubmitted={() => showToast('反馈已收到，感谢你的建议！')}
      />

      <PostDetailDialog
        postId={detailPostId}
        currentUser={user}
        onClose={closePostDetail}
        onRequireAuth={() => requireAuthThen()}
        onPostUpdated={(updated) => {
          setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setBookmarksRefreshKey((k) => k + 1);
          setProfileRefreshKey((k) => k + 1);
          setDiscoverRefreshKey((k) => k + 1);
        }}
        onPostDeleted={(deletedId) => {
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
          setTotal((t) => Math.max(0, t - 1));
          setBookmarksRefreshKey((k) => k + 1);
          setProfileRefreshKey((k) => k + 1);
          setDiscoverRefreshKey((k) => k + 1);
        }}
        onOpenAuthor={goUserProfile}
        onSelectTag={handleSelectTagFromAnyView}
      />

      <ProfileDialog
        open={profileOpen}
        user={user}
        onOpenChange={setProfileOpen}
        onUpdated={(updated) => {
          setUser(updated);
          refreshAccounts();
          setProfileRefreshKey((k) => k + 1);
          setDiscoverRefreshKey((k) => k + 1);
          loadPosts();
        }}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg md:bottom-6"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
