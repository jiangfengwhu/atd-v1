import React, { useState, useEffect } from 'react';
import { getFingerprint, setFingerprint } from './api';
import { Feed } from './components/Feed';
import { Messages } from './components/Messages';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'feed' | 'messages'>('feed');
  const [currentFp, setCurrentFp] = useState<string>('');
  const [dmTargetUser, setDmTargetUser] = useState<string>('');
  const [isEditingFp, setIsEditingFp] = useState(false);
  const [tempFp, setTempFp] = useState('');

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
      // Reload or refresh view
      window.location.reload();
    }
  };

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <header className="navbar">
        <div className="navbar-brand">
          <div className="brand-logo">💬</div>
          <span className="brand-title">用户社区 (Community)</span>
        </div>

        <nav className="nav-links">
          <button
            type="button"
            className={`nav-btn ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
          >
            📰 动态 Feed
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
          >
            ✉️ 站内信
          </button>
        </nav>

        <div className="user-identity-box">
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
              <span className="identity-label">指纹标识:</span>
              <code className="identity-code" title={currentFp}>
                {currentFp.length > 18
                  ? `${currentFp.slice(0, 16)}...`
                  : currentFp}
              </code>
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
      </header>

      {/* Main Content Area */}
      <div className="main-content">
        {activeTab === 'feed' ? (
          <Feed onSelectUserForDm={handleSelectUserForDm} />
        ) : (
          <Messages
            initialRecipient={dmTargetUser}
            currentUserId={currentFp}
          />
        )}
      </div>

      <footer className="footer">
        <p>
          Cloudflare Workers + Hono + D1 强力驱动 · 无感浏览器指纹登录
        </p>
      </footer>
    </div>
  );
};
