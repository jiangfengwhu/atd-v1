import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../api';
import { Comments } from './Comments';
import {
  VerifiedBadgeIcon,
  ReplyIcon,
  RepostIcon,
  HeartIcon,
  HeartFilledIcon,
  ViewsIcon,
  BookmarkIcon,
  ShareIcon,
  MoreIcon,
  ImageIcon,
  GifIcon,
  PollIcon,
  EmojiIcon,
  ScheduleIcon,
  LocationIcon,
} from './Icons';

interface Post {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface FeedProps {
  onSelectUserForDm?: (userId: string) => void;
  currentUserId?: string;
}

export const Feed: React.FC<FeedProps> = ({ onSelectUserForDm, currentUserId = '' }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [publishError, setPublishError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);

  // Micro-interaction states
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [repostedPosts, setRepostedPosts] = useState<Record<string, boolean>>({});
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Record<string, boolean>>({});

  const fetchFeed = async (reset = true) => {
    if (reset) {
      setLoading(true);
      setFeedError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const url =
        reset || !nextCursor
          ? '/api/v1/feed?limit=20'
          : `/api/v1/feed?cursor=${encodeURIComponent(nextCursor)}&limit=20`;

      const data = await apiRequest<{ posts: Post[]; next_cursor: string }>(url);
      if (reset) {
        setPosts(data.posts || []);
      } else {
        setPosts((prev) => [...prev, ...(data.posts || [])]);
      }
      setNextCursor(data.next_cursor || '');
      setFeedError(null);
    } catch (err: any) {
      console.error('Feed loading error:', err);
      setFeedError('动态加载失败，服务异常 (500_DB_ERROR)');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchFeed(true);
  }, []);

  const handlePublish = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Guard against concurrent double-click
    if (submittingRef.current) {
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      setPublishError('内容不能为空 (invalid content)');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setPublishError('');

    try {
      await apiRequest('/api/v1/posts', {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      });
      setContent('');
      setPublishError('');
      // Reload feed to show new post
      await fetchFeed(true);
    } catch (err: any) {
      setPublishError(err.message || '发布失败');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const toggleLike = (postId: string) => {
    setLikedPosts((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  const toggleRepost = (postId: string) => {
    setRepostedPosts((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  const toggleBookmark = (postId: string) => {
    setBookmarkedPosts((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  const formatViews = (id: string) => {
    // Generate deterministic nice view count from id
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i);
      hash |= 0;
    }
    const count = Math.abs(hash % 900) + 120;
    return `${(count / 10).toFixed(1)}K`;
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 60) return `${Math.max(1, diffSecs)}秒前`;
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}分钟前`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}小时前`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="feed-container">
      {/* 1:1 X.com Tweet Compose Box */}
      <div className="post-create-card x-compose-box">
        <div className="x-compose-avatar">
          <div className="avatar">
            {currentUserId ? currentUserId.slice(0, 2).toUpperCase() : 'ME'}
          </div>
        </div>

        <div className="x-compose-main">
          <div className="x-audience-badge" title="受众设置">
            🌐 所有人可见
          </div>

          <form onSubmit={handlePublish}>
            <textarea
              className="textarea-field x-compose-textarea"
              aria-label="说点什么"
              placeholder="有什么新鲜事？说点什么，分享你的想法..."
              rows={3}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (publishError) setPublishError('');
              }}
            />

            {publishError && (
              <div className="error-banner x-fade-in-up" role="alert">
                ⚠️ {publishError}
              </div>
            )}

            <div className="x-compose-divider" />

            <div className="x-compose-footer">
              <div className="x-compose-tools">
                <button type="button" className="x-icon-btn" title="媒体图片">
                  <ImageIcon size={19} />
                </button>
                <button type="button" className="x-icon-btn" title="GIF">
                  <GifIcon size={19} />
                </button>
                <button type="button" className="x-icon-btn" title="投票">
                  <PollIcon size={19} />
                </button>
                <button type="button" className="x-icon-btn" title="表情符号">
                  <EmojiIcon size={19} />
                </button>
                <button type="button" className="x-icon-btn" title="定时排程">
                  <ScheduleIcon size={19} />
                </button>
                <button type="button" className="x-icon-btn" title="位置">
                  <LocationIcon size={19} />
                </button>
              </div>

              <div className="x-compose-right">
                <span className="char-count">{content.length} 字</span>
                <span className="x-v-divider" />
                <button
                  type="submit"
                  className="btn btn-primary x-tweet-btn x-btn-active"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '发布中...' : '发布'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Feed list / Error State */}
      {feedError ? (
        <div className="card error-card x-fade-in-up" role="alert">
          <div className="error-title">{feedError}</div>
          <button
            type="button"
            className="btn btn-secondary x-btn-active"
            onClick={() => fetchFeed(true)}
          >
            刷新
          </button>
        </div>
      ) : (
        <div data-testid="feed-list" role="main" className="feed-list">
          {loading && posts.length === 0 ? (
            <div className="x-skeletons-wrapper">
              {[1, 2, 3].map((i) => (
                <div key={i} className="x-skeleton-card">
                  <div className="x-shimmer x-skeleton-avatar" />
                  <div className="x-skeleton-body">
                    <div className="x-shimmer x-skeleton-line short" />
                    <div className="x-shimmer x-skeleton-line" />
                    <div className="x-shimmer x-skeleton-line medium" />
                    <div className="x-skeleton-actions">
                      <div className="x-shimmer x-skeleton-circle" />
                      <div className="x-shimmer x-skeleton-circle" />
                      <div className="x-shimmer x-skeleton-circle" />
                      <div className="x-shimmer x-skeleton-circle" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="card empty-card x-fade-in-up">
              <h3 style={{ marginBottom: 6, fontWeight: 700 }}>欢迎来到社区流！</h3>
              <p>暂无动态，快来发布第一条内容吧！</p>
            </div>
          ) : (
            posts.map((post) => {
              const isLiked = !!likedPosts[post.id];
              const isReposted = !!repostedPosts[post.id];
              const isBookmarked = !!bookmarkedPosts[post.id];

              return (
                <article
                  key={post.id}
                  className="card post-card x-tweet-card x-fade-in-up"
                >
                  <div className="x-tweet-avatar-col">
                    <div className="avatar">
                      {post.user_id.slice(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="x-tweet-content-col">
                    <div className="post-header x-tweet-header">
                      <div className="author-info x-tweet-author-info">
                        <span className="author-name">
                          {post.user_id.length > 12
                            ? `User-${post.user_id.slice(0, 6)}`
                            : post.user_id}
                        </span>
                        <VerifiedBadgeIcon className="x-verified-badge" size={17} />
                        <span className="x-handle">
                          @{post.user_id.slice(0, 10)}
                        </span>
                        <span className="x-dot">·</span>
                        <time className="post-time" dateTime={post.created_at}>
                          {formatRelativeTime(post.created_at)}
                        </time>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {onSelectUserForDm && (
                          <button
                            type="button"
                            className="btn-link x-dm-quick-btn"
                            onClick={() => onSelectUserForDm(post.user_id)}
                            title="发送私信给该作者"
                          >
                            发消息
                          </button>
                        )}
                        <button type="button" className="x-more-btn" title="更多选项">
                          <MoreIcon size={18} />
                        </button>
                      </div>
                    </div>

                    {/* Safe text content rendering against XSS */}
                    <div className="post-content x-tweet-text">{post.content}</div>

                    {/* Tweet Actions Row */}
                    <div className="post-footer x-tweet-actions-bar">
                      <button
                        type="button"
                        className={`x-tweet-action-btn x-reply-btn ${
                          activeCommentsPostId === post.id ? 'active' : ''
                        }`}
                        onClick={() =>
                          setActiveCommentsPostId(
                            activeCommentsPostId === post.id ? null : post.id
                          )
                        }
                        aria-label="评论"
                      >
                        <ReplyIcon size={18} />
                        <span>
                          {activeCommentsPostId === post.id ? '收起评论' : '评论'}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={`x-tweet-action-btn x-repost-btn ${
                          isReposted ? 'reposted' : ''
                        }`}
                        onClick={() => toggleRepost(post.id)}
                        aria-label="转发"
                      >
                        <RepostIcon size={18} />
                        <span>{isReposted ? '1' : ''}</span>
                      </button>

                      <button
                        type="button"
                        className={`x-tweet-action-btn x-like-btn ${
                          isLiked ? 'liked' : ''
                        }`}
                        onClick={() => toggleLike(post.id)}
                        aria-label="喜欢"
                      >
                        {isLiked ? (
                          <HeartFilledIcon className="x-heart-pop" size={18} />
                        ) : (
                          <HeartIcon size={18} />
                        )}
                        <span>{isLiked ? '1' : ''}</span>
                      </button>

                      <button
                        type="button"
                        className="x-tweet-action-btn x-views-btn"
                        aria-label="浏览量"
                      >
                        <ViewsIcon size={18} />
                        <span>{formatViews(post.id)}</span>
                      </button>

                      <button
                        type="button"
                        className={`x-tweet-action-btn x-bookmark-btn ${
                          isBookmarked ? 'active' : ''
                        }`}
                        onClick={() => toggleBookmark(post.id)}
                        aria-label="书签"
                      >
                        <BookmarkIcon size={18} />
                      </button>

                      <button
                        type="button"
                        className="x-tweet-action-btn x-share-btn"
                        aria-label="分享"
                      >
                        <ShareIcon size={18} />
                      </button>
                    </div>

                    {/* Expanded Thread Comments */}
                    {activeCommentsPostId === post.id && (
                      <Comments postId={post.id} />
                    )}
                  </div>
                </article>
              );
            })
          )}

          {nextCursor && !loading && (
            <div className="load-more-container">
              <button
                type="button"
                className="btn btn-secondary x-btn-active"
                disabled={loadingMore}
                onClick={() => fetchFeed(false)}
              >
                {loadingMore ? '正在加载...' : '加载更多动态'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
