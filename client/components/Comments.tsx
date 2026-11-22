import React, { useState, useEffect, useRef } from 'react';
import { apiRequest, getFingerprint } from '../api';

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  author_name?: string;
  parent_id: string | null;
  content: string;
  created_at: string;
}

interface CommentsProps {
  postId: string;
  currentUserLabel?: string;
  autoFocus?: boolean;
  focusTrigger?: number;
  onCommentAdded?: (totalComments?: number) => void;
}

export const Comments: React.FC<CommentsProps> = ({
  postId,
  currentUserLabel,
  autoFocus = false,
  focusTrigger = 0,
  onCommentAdded,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadComments = async (): Promise<Comment[] | null> => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiRequest<{ comments: Comment[] }>(
        `/api/v1/posts/${encodeURIComponent(postId)}/comments`
      );
      const list = data.comments || [];
      setComments(list);
      return list;
    } catch (err: any) {
      setLoadError(err?.message || '评论加载失败，请重试');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [postId]);

  useEffect(() => {
    if (autoFocus || focusTrigger > 0) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [autoFocus, focusTrigger, postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    if (!content.trim()) {
      setError('评论内容不能为空 (invalid content)');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      await apiRequest(`/api/v1/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim(),
          parent_id: replyTo,
        }),
      });
      setContent('');
      setReplyTo(null);
      const refreshed = await loadComments();
      onCommentAdded?.(refreshed ? refreshed.length : undefined);
    } catch (err: any) {
      setError(err?.message || '评论发送失败');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const avatarSeed = currentUserLabel || getFingerprint();

  return (
    <div className="comments-section x-comments-thread x-fade-in-up">
      <h4 className="comments-title">回复列表 ({comments.length})</h4>

      {/* Reply compose form */}
      <form onSubmit={handleSubmit} className="comment-form x-thread-reply-form">
        {replyTo && (
          <div className="replying-banner x-fade-in-up">
            <span>回复评论 #{replyTo.slice(0, 6)}</span>
            <button
              type="button"
              className="btn-link"
              onClick={() => setReplyTo(null)}
            >
              取消回复
            </button>
          </div>
        )}

        <div className="x-thread-input-row">
          <div className="avatar x-avatar-sm">
            {avatarSeed ? avatarSeed.slice(0, 2).toUpperCase() : 'ME'}
          </div>
          <div className="x-thread-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="input-field x-thread-input"
              placeholder={replyTo ? '撰写评论... / 撰写回复...' : '撰写评论...'}
              aria-label="回复"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError('');
              }}
            />
            <button
              type="submit"
              className="btn btn-primary x-thread-submit-btn x-btn-active"
              disabled={submitting}
            >
              {submitting ? '回复中...' : '回复'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message x-fade-in-up" role="alert">
            {error}
          </div>
        )}
      </form>

      {/* Thread list */}
      {loading && comments.length === 0 ? (
        <div className="x-comments-loading" style={{ padding: '12px 0' }}>
          <div className="x-shimmer x-skeleton-line short" style={{ marginBottom: 8 }} />
          <div className="x-shimmer x-skeleton-line medium" />
        </div>
      ) : loadError ? (
        <div className="error-banner x-comments-error" role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadComments()}
          >
            重试
          </button>
        </div>
      ) : comments.length === 0 ? (
        <div className="empty-state-sm">暂无回复，发表第一条观点吧</div>
      ) : (
        <div className="comments-list x-thread-list">
          {comments.map((c) => {
            const displayAuthor =
              c.author_name ||
              (c.user_id.length > 12 ? `User-${c.user_id.slice(0, 6)}` : c.user_id);
            return (
              <div
                key={c.id}
                className={`comment-item x-thread-item ${
                  c.parent_id ? 'nested-reply' : ''
                } x-fade-in-up`}
              >
                {c.parent_id && <div className="x-thread-line" />}
                <div className="comment-header">
                  <div className="x-comment-author">
                    <div className="avatar x-avatar-xs">
                      {displayAuthor.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="user-badge author-name">
                      {displayAuthor}
                    </span>
                  </div>
                  <time className="timestamp" dateTime={c.created_at}>
                    {new Date(c.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>

                <div className="comment-content">{c.content}</div>

                <div className="comment-actions">
                  <button
                    type="button"
                    className="btn-link x-comment-reply-btn"
                    onClick={() => {
                      setReplyTo(c.id);
                      inputRef.current?.focus();
                    }}
                  >
                    回复
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
