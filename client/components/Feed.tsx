import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../api';
import { Comments } from './Comments';

interface Post {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface FeedProps {
  onSelectUserForDm?: (userId: string) => void;
}

export const Feed: React.FC<FeedProps> = ({ onSelectUserForDm }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [publishError, setPublishError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(
    null
  );

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
      setFeedError('动态加载失败，服务异常');
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

  return (
    <div className="feed-container">
      {/* Post creation card */}
      <div className="card post-create-card">
        <h3 className="section-title">发布动态</h3>
        <form onSubmit={handlePublish}>
          <div className="input-group">
            <textarea
              className="textarea-field"
              aria-label="说点什么"
              placeholder="说点什么，分享你的想法..."
              rows={3}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (publishError) setPublishError('');
              }}
            />
          </div>

          {publishError && (
            <div className="error-banner" role="alert">
              {publishError}
            </div>
          )}

          <div className="post-create-footer">
            <span className="char-count">{content.length} 字</span>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? '发布中...' : '发布'}
            </button>
          </div>
        </form>
      </div>

      {/* Feed list / Error State */}
      {feedError ? (
        <div className="card error-card" role="alert">
          <div className="error-title">{feedError}</div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fetchFeed(true)}
          >
            刷新
          </button>
        </div>
      ) : (
        <div
          data-testid="feed-list"
          role="main"
          className="feed-list"
        >
          {loading && posts.length === 0 ? (
            <div className="card loading-card">加载动态流中...</div>
          ) : posts.length === 0 ? (
            <div className="card empty-card">
              <p>暂无动态，快来发布第一条内容吧！</p>
            </div>
          ) : (
            posts.map((post) => (
              <article key={post.id} className="card post-card">
                <div className="post-header">
                  <div className="author-info">
                    <div className="avatar">
                      {post.user_id.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="author-name">{post.user_id}</div>
                      <time className="post-time" dateTime={post.created_at}>
                        {new Date(post.created_at).toLocaleString()}
                      </time>
                    </div>
                  </div>
                  {onSelectUserForDm && (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => onSelectUserForDm(post.user_id)}
                      title="发送私信"
                    >
                      发消息
                    </button>
                  )}
                </div>

                {/* Safe text content rendering against XSS */}
                <div className="post-content">{post.content}</div>

                <div className="post-footer">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() =>
                      setActiveCommentsPostId(
                        activeCommentsPostId === post.id ? null : post.id
                      )
                    }
                  >
                    💬 {activeCommentsPostId === post.id ? '收起评论' : '评论'}
                  </button>
                </div>

                {activeCommentsPostId === post.id && (
                  <Comments postId={post.id} />
                )}
              </article>
            ))
          )}

          {nextCursor && !loading && (
            <div className="load-more-container">
              <button
                type="button"
                className="btn btn-secondary"
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
