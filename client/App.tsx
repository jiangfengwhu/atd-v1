import React, { useState, useEffect } from 'react';
import { getFingerprint, setFingerprint } from './api';
import { Feed } from './components/Feed';
import { Messages } from './components/Messages';
import {
  XLogoIcon,
  HomeIcon,
  MailIcon,
  SearchIcon,
  VerifiedBadgeIcon,
} from './components/Icons';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'feed' | 'messages'>('feed');
  const [feedFilter, setFeedFilter] = useState<'for-you' | 'following'>('for-you');
  const [currentFp, setCurrentFp] = useState<string>('');
  const [dmTargetUser, setDmTargetUser] = useState<string>('');
  const [isEditingFp, setIsEditingFp] = useState(false);
  const [tempFp, setTempFp] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const fp = getFingerprint();
    setCurrentFp(fp);
    setTempFp(fp);
  }, []);

  const handleSelectUserForDm = (userId: string) => {
    setDmTargetUser(userId);
    setActiveTab('messages');
  };

  const handleSaveFingerprint = () => {
    if (tempFp.trim()) {
      setFingerprint(tempFp.trim());
      setCurrentFp(tempFp.trim());
      setIsEditingFp(false);
      window.location.reload();
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="x-app-wrapper" data-theme={theme}>
      <div className="x-layout">
        {/* Left Navigation Sidebar */}
        <aside className="x-sidebar-left">
          <div className="x-sidebar-nav-group">
            {/* X Brand Logo */}
            <button
              type="button"
              className="x-logo-btn"
              title="X.com Community"
              onClick={() => setActiveTab('feed')}
            >
              <XLogoIcon size={30} />
            </button>

            {/* Navigation Menu */}
            <nav className="x-nav-menu">
              <button
                type="button"
                className={`x-nav-item nav-btn ${activeTab === 'feed' ? 'active' : ''}`}
                onClick={() => setActiveTab('feed')}
              >
                <span className="x-nav-icon">
                  <HomeIcon size={24} />
                </span>
                <span className="x-nav-label">动态 Feed</span>
              </button>

              <button
                type="button"
                className={`x-nav-item nav-btn ${activeTab === 'messages' ? 'active' : ''}`}
                onClick={() => setActiveTab('messages')}
              >
                <span className="x-nav-icon">
                  <MailIcon size={24} />
                </span>
                <span className="x-nav-label">站内信</span>
              </button>
            </nav>

            {/* Fast Tweet / Post action trigger on desktop sidebar */}
            <button
              type="button"
              className="x-sidebar-tweet-btn"
              onClick={() => {
                if (activeTab !== 'feed') {
                  setActiveTab('feed');
                }
                setTimeout(() => {
                  const textarea = document.querySelector<HTMLTextAreaElement>(
                    '.x-compose-textarea'
                  );
                  if (textarea) textarea.focus();
                }, 50);
              }}
            >
              发推
            </button>
          </div>

          {/* User Identity / Account Card */}
          <div
            className="user-identity-box"
            data-testid="user-identity"
            title={`指纹 ID: ${currentFp}`}
          >
            {isEditingFp ? (
              <div className="identity-editor">
                <input
                  type="text"
                  className="input-field input-sm"
                  value={tempFp}
                  onChange={(e) => setTempFp(e.target.value)}
                  placeholder="指纹 ID"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleSaveFingerprint}
                >
                  保存
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setIsEditingFp(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="identity-display">
                <div className="user-avatar-sm">
                  {currentFp ? currentFp.slice(0, 2).toUpperCase() : 'ME'}
                </div>
                <div className="identity-info">
                  <span className="identity-name">
                    {currentFp ? currentFp.slice(0, 10) : 'Anonymous'}
                  </span>
                  <span className="identity-handle">
                    @{currentFp ? currentFp.slice(0, 12) : 'guest'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-icon"
                  title="切换/模拟浏览器指纹"
                  onClick={() => setIsEditingFp(true)}
                >
                  ✏️
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Center Main Column */}
        <div className="x-main-col">
          {/* Sticky Header with Blur and Theme Toggle */}
          <header className="x-header">
            <div className="x-header-top">
              <h1 className="x-header-title">
                {activeTab === 'feed' ? '主页' : '站内私信'}
              </h1>
              <div className="x-header-controls">
                <button
                  type="button"
                  className="x-theme-toggle-btn"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? '切换为亮色模式' : '切换为暗色模式'}
                >
                  {theme === 'dark' ? '☀️' : '🌙'}
                </button>
              </div>
            </div>

            {/* Sub-tabs when on Feed */}
            {activeTab === 'feed' && (
              <div className="x-header-tabs">
                <button
                  type="button"
                  className={`x-tab-btn ${feedFilter === 'for-you' ? 'active' : ''}`}
                  onClick={() => setFeedFilter('for-you')}
                >
                  为你推荐
                  {feedFilter === 'for-you' && <div className="x-tab-indicator" />}
                </button>
                <button
                  type="button"
                  className={`x-tab-btn ${feedFilter === 'following' ? 'active' : ''}`}
                  onClick={() => setFeedFilter('following')}
                >
                  正在关注
                  {feedFilter === 'following' && <div className="x-tab-indicator" />}
                </button>
              </div>
            )}
          </header>

          {/* Active View */}
          {activeTab === 'feed' ? (
            <Feed
              onSelectUserForDm={handleSelectUserForDm}
              currentUserId={currentFp}
            />
          ) : (
            <Messages
              initialRecipient={dmTargetUser}
              currentUserId={currentFp}
            />
          )}
        </div>

        {/* Right Sidebar: Trends, Search & Who to Follow */}
        <aside className="x-sidebar-right">
          {/* Search Box */}
          <div className="x-search-box">
            <SearchIcon size={18} />
            <input
              type="text"
              className="x-search-input"
              aria-label="搜索"
              placeholder="搜索 X / 热门话题"
            />
          </div>

          {/* Premium Subscription Card */}
          <div className="x-widget-card">
            <h3 className="x-widget-title">订阅 Premium</h3>
            <p className="x-widget-desc">
              订阅以解锁创作者分成、专属蓝色认证标识等更多高级体验与前沿功能。
            </p>
            <button type="button" className="x-subscribe-btn">
              订阅
            </button>
          </div>

          {/* Trending Topics Widget */}
          <div className="x-widget-card">
            <h3 className="x-widget-title">实时趋势</h3>
            <div className="x-trend-list">
              <div className="x-trend-item">
                <div>
                  <div className="x-trend-category">科技 · 实时热门</div>
                  <div className="x-trend-topic">#React19</div>
                  <div className="x-trend-count">48.2K 动态</div>
                </div>
                <span>···</span>
              </div>
              <div className="x-trend-item">
                <div>
                  <div className="x-trend-category">云计算 · 实时热门</div>
                  <div className="x-trend-topic">#CloudflareWorkers</div>
                  <div className="x-trend-count">29.6K 动态</div>
                </div>
                <span>···</span>
              </div>
              <div className="x-trend-item">
                <div>
                  <div className="x-trend-category">设计与动效 · 实时热门</div>
                  <div className="x-trend-topic">#Awwwards2026</div>
                  <div className="x-trend-count">16.4K 动态</div>
                </div>
                <span>···</span>
              </div>
              <div className="x-trend-item">
                <div>
                  <div className="x-trend-category">全栈工程 · 实时热门</div>
                  <div className="x-trend-topic">#HonoFramework</div>
                  <div className="x-trend-count">12.1K 动态</div>
                </div>
                <span>···</span>
              </div>
            </div>
          </div>

          {/* Who to Follow Widget */}
          <div className="x-widget-card">
            <h3 className="x-widget-title">推荐关注</h3>
            <div className="x-follow-list">
              <div className="x-follow-item">
                <div className="x-follow-user">
                  <div className="avatar x-avatar-sm" style={{ background: '#1d9bf0' }}>
                    AG
                  </div>
                  <div className="x-follow-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span className="x-follow-name">Antigravity AI</span>
                      <VerifiedBadgeIcon size={14} />
                    </div>
                    <span className="x-follow-handle">@antigravity</span>
                  </div>
                </div>
                <button type="button" className="x-follow-btn">
                  关注
                </button>
              </div>

              <div className="x-follow-item">
                <div className="x-follow-user">
                  <div className="avatar x-avatar-sm" style={{ background: '#f6821f' }}>
                    CF
                  </div>
                  <div className="x-follow-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span className="x-follow-name">Cloudflare D1</span>
                      <VerifiedBadgeIcon size={14} />
                    </div>
                    <span className="x-follow-handle">@cloudflare_d1</span>
                  </div>
                </div>
                <button type="button" className="x-follow-btn">
                  关注
                </button>
              </div>
            </div>
          </div>

          {/* Footer Meta Links */}
          <footer className="x-sidebar-footer">
            <a href="#terms">服务条款</a>
            <a href="#privacy">隐私政策</a>
            <a href="#cookies">Cookie 政策</a>
            <a href="#accessibility">无障碍辅助</a>
            <span>© 2026 X Corp. / Community</span>
          </footer>
        </aside>
      </div>
    </div>
  );
};
