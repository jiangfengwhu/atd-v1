import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Flame,
  Home,
  LogIn,
  LogOut,
  Mail,
  Moon,
  PenSquare,
  Search,
  Sparkles,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  apiRequest,
  clearAuthToken,
  getAuthToken,
  getFingerprint,
} from './api';
import { AdminPage } from './components/AdminPage';
import { AuthModal, AuthenticatedUser } from './components/AuthModal';
import { Feed } from './components/Feed';
import { Messages } from './components/Messages';

interface OverviewStats {
  site_name: string;
  totals: {
    posts: number;
    users: number;
    comments: number;
    likes: number;
    reposts: number;
    clicks: number;
  };
  hot_posts: Array<{
    id: string;
    content: string;
    author_name: string;
    likes_count: number;
    reposts_count: number;
    comments_count: number;
    clicks_count: number;
  }>;
}

export const App: React.FC = () => {
  const isAdminPath =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/admin' ||
      window.location.pathname.startsWith('/admin/'));

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('community_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    return 'light';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('community_theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Hidden Admin Console Route (zero links exposed in public UI)
  if (isAdminPath) {
    return <AdminPage theme={theme} onToggleTheme={toggleTheme} />;
  }

  return <CommunityApp theme={theme} onToggleTheme={toggleTheme} />;
};

interface CommunityAppProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

const CommunityApp: React.FC<CommunityAppProps> = ({ theme, onToggleTheme }) => {
  const [activeTab, setActiveTab] = useState<'feed' | 'messages'>('feed');
  const [feedSort, setFeedSort] = useState<'latest' | 'hot'>('latest');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dmTargetUser, setDmTargetUser] = useState('');

  const [currentFp, setCurrentFp] = useState('');
  const [emailUser, setEmailUser] = useState<AuthenticatedUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [overview, setOverview] = useState<OverviewStats | null>(null);

  const loadAuthState = async () => {
    const token = getAuthToken();
    if (!token) {
      // Also check cookie session without failing loudly
      try {
        const res = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
        if (res.ok) {
          const data = (await res.json()) as {
            auth_type?: string;
            user?: AuthenticatedUser;
          };
          if (data?.auth_type === 'email' && data.user) {
            setEmailUser(data.user);
            return;
          }
        }
      } catch {
        // ignore
      }
      setEmailUser(null);
      return;
    }

    try {
      const data = await apiRequest<{
        authenticated: boolean;
        auth_type: 'email' | 'fingerprint';
        user: AuthenticatedUser;
      }>('/api/v1/auth/me');
      if (data.auth_type === 'email' && data.user) {
        setEmailUser(data.user);
      } else {
        setEmailUser(null);
      }
    } catch {
      clearAuthToken();
      setEmailUser(null);
    }
  };

  const loadOverview = async () => {
    try {
      const data = await apiRequest<OverviewStats>('/api/v1/stats/overview');
      setOverview(data);
    } catch {
      // ignore non-critical sidebar load failures
    }
  };

  useEffect(() => {
    setCurrentFp(getFingerprint());
    loadAuthState();
    loadOverview();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const handleLogout = async () => {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearAuthToken();
    setEmailUser(null);
    toast.success('已退出登录');
  };

  const handleSelectUserForDm = (userId: string) => {
    setDmTargetUser(userId);
    setActiveTab('messages');
  };

  const activeUserId = emailUser?.id || currentFp;
  const activeUserLabel = emailUser?.username || currentFp;
  const siteName = overview?.site_name || 'Pulse 社区';

  return (
    <div className="x-app-wrapper" data-theme={theme}>
      <div className="x-layout">
        {/* Left Navigation Sidebar */}
        <aside className="x-sidebar-left">
          <div className="x-sidebar-nav-group">
            <button
              type="button"
              className="x-logo-btn"
              title={siteName}
              onClick={() => setActiveTab('feed')}
            >
              <Sparkles size={26} />
            </button>

            <nav className="x-nav-menu" aria-label="主导航">
              <button
                type="button"
                className={`x-nav-item nav-btn ${activeTab === 'feed' ? 'active' : ''}`}
                onClick={() => setActiveTab('feed')}
              >
                <span className="x-nav-icon">
                  <Home size={22} />
                </span>
                <span className="x-nav-label">动态 Feed</span>
              </button>

              <button
                type="button"
                className={`x-nav-item nav-btn ${activeTab === 'messages' ? 'active' : ''}`}
                onClick={() => setActiveTab('messages')}
              >
                <span className="x-nav-icon">
                  <Mail size={22} />
                </span>
                <span className="x-nav-label">站内信</span>
              </button>
            </nav>

            <button
              type="button"
              className="x-sidebar-tweet-btn"
              onClick={() => {
                if (activeTab !== 'feed') {
                  setActiveTab('feed');
                }
                window.setTimeout(() => {
                  const textarea = document.querySelector<HTMLTextAreaElement>(
                    '.x-compose-textarea'
                  );
                  textarea?.focus();
                }, 50);
              }}
            >
              <PenSquare size={18} />
              <span>写动态</span>
            </button>
          </div>

          {/* Account Status Card */}
          <div className="user-identity-box" data-testid="user-identity">
            {emailUser ? (
              <div className="identity-display">
                <div className="user-avatar-sm">
                  {emailUser.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="identity-info">
                  <span className="identity-name">{emailUser.username}</span>
                  <span className="identity-handle">
                    {emailUser.email || `@${emailUser.id.slice(0, 8)}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-icon x-logout-btn"
                  title="退出登录"
                  aria-label="退出登录"
                  onClick={handleLogout}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="x-sidebar-login-btn"
                onClick={() => setAuthModalOpen(true)}
              >
                <LogIn size={18} />
                <span>邮箱登录</span>
              </button>
            )}
          </div>
        </aside>

        {/* Center Main Column */}
        <main className="x-main-col">
          <header className="x-header">
            <div className="x-header-top">
              <h1 className="x-header-title">
                {activeTab === 'feed' ? siteName : '站内私信'}
              </h1>

              <div className="x-header-controls">
                {emailUser ? (
                  <div className="x-header-user-pill">
                    <span className="x-header-user-email">
                      {emailUser.email || emailUser.username}
                    </span>
                    <button
                      type="button"
                      className="btn-link x-header-logout-link"
                      onClick={handleLogout}
                    >
                      退出
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm x-header-login-btn"
                    onClick={() => setAuthModalOpen(true)}
                  >
                    <LogIn size={14} />
                    <span>邮箱登录</span>
                  </button>
                )}

                <button
                  type="button"
                  className="x-theme-toggle-btn"
                  onClick={onToggleTheme}
                  aria-label={theme === 'dark' ? '切换为亮色模式' : '切换为暗色模式'}
                  title={theme === 'dark' ? '切换为亮色模式' : '切换为暗色模式'}
                >
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </div>
            </div>

            {activeTab === 'feed' && (
              <div className="x-header-tabs">
                <button
                  type="button"
                  className={`x-tab-btn ${feedSort === 'latest' ? 'active' : ''}`}
                  onClick={() => setFeedSort('latest')}
                >
                  最新动态
                  {feedSort === 'latest' && <div className="x-tab-indicator" />}
                </button>
                <button
                  type="button"
                  className={`x-tab-btn ${feedSort === 'hot' ? 'active' : ''}`}
                  onClick={() => setFeedSort('hot')}
                >
                  热门精选
                  {feedSort === 'hot' && <div className="x-tab-indicator" />}
                </button>
              </div>
            )}
          </header>

          {activeTab === 'feed' ? (
            <Feed
              sort={feedSort}
              searchQuery={searchQuery}
              onSelectUserForDm={handleSelectUserForDm}
              currentUserLabel={activeUserLabel}
              onStatsChange={loadOverview}
            />
          ) : (
            <Messages
              initialRecipient={dmTargetUser}
              currentUserId={activeUserId}
            />
          )}
        </main>

        {/* Right Sidebar: Real Search, Real Community Stats, Real Hot Posts */}
        <aside className="x-sidebar-right">
          <div className="x-search-box">
            <Search size={18} />
            <input
              type="text"
              className="x-search-input"
              aria-label="搜索"
              placeholder="搜索社区动态..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="x-widget-card" data-testid="community-stats-card">
            <div className="x-widget-header">
              <BarChart3 size={18} />
              <h3 className="x-widget-title">社区实时数据</h3>
            </div>
            <div className="x-stats-grid">
              <div className="x-stat-cell">
                <span className="x-stat-label">动态</span>
                <strong className="x-stat-val">{overview?.totals.posts ?? 0}</strong>
              </div>
              <div className="x-stat-cell">
                <span className="x-stat-label">成员</span>
                <strong className="x-stat-val">{overview?.totals.users ?? 0}</strong>
              </div>
              <div className="x-stat-cell">
                <span className="x-stat-label">点击</span>
                <strong className="x-stat-val">{overview?.totals.clicks ?? 0}</strong>
              </div>
              <div className="x-stat-cell">
                <span className="x-stat-label">点赞</span>
                <strong className="x-stat-val">{overview?.totals.likes ?? 0}</strong>
              </div>
              <div className="x-stat-cell">
                <span className="x-stat-label">转发</span>
                <strong className="x-stat-val">{overview?.totals.reposts ?? 0}</strong>
              </div>
              <div className="x-stat-cell">
                <span className="x-stat-label">评论</span>
                <strong className="x-stat-val">{overview?.totals.comments ?? 0}</strong>
              </div>
            </div>
          </div>

          <div className="x-widget-card" data-testid="hot-posts-card">
            <div className="x-widget-header">
              <Flame size={18} />
              <h3 className="x-widget-title">热门动态</h3>
            </div>

            {overview && overview.hot_posts.length > 0 ? (
              <div className="x-hot-list">
                {overview.hot_posts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="x-hot-item"
                    onClick={() => {
                      setActiveTab('feed');
                      setFeedSort('hot');
                    }}
                  >
                    <div className="x-hot-author">{item.author_name}</div>
                    <div className="x-hot-snippet">
                      {item.content
                        ? item.content.slice(0, 64)
                        : '（图片动态）'}
                    </div>
                    <div className="x-hot-meta">
                      <span>{item.likes_count} 赞</span>
                      <span>·</span>
                      <span>{item.comments_count} 评</span>
                      <span>·</span>
                      <span>{item.clicks_count} 点击</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="x-widget-desc">暂无热门动态，发布或互动后将实时更新。</p>
            )}
          </div>
        </aside>
      </div>

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onAuthenticated={(user) => {
          setEmailUser(user);
          loadOverview();
        }}
      />
    </div>
  );
};
