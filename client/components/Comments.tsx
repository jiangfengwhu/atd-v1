import React, { useState, useEffect } from 'react';
import { apiRequest, getFingerprint } from '../api';

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
}

interface CommentsProps {
  postId: string;
}

export const Comments: React.FC<CommentsProps> = ({ postId }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ comments: Comment[] }>(
        `/api/v1/posts/${postId}/comments`
      );
      setComments(data.comments || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('评论内容不能为空 (invalid content)');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await apiRequest(`/api/v1/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim(),
          parent_id: replyTo,
        }),
      });
      setContent('');
      setReplyTo(null);
      await loadComments();
    } catch (err: any) {
      setError(err.message || '评论发送失败');
    } finally {
      setSubmitting(false);
    }
  };

  const currentFp = getFingerprint();

  return (
    <div className="comments-section x-comments-thread x-fade-in-up">
      <h4 className="comments-title">
        💬 回复对话流 ({comments.length})
      </h4>

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
            {currentFp ? currentFp.slice(0, 2).toUpperCase() : 'ME'}
          </div>
          <div className="x-thread-input-wrapper">
            <input
              type="text"
              className="input-field x-thread-input"
              placeholder={replyTo ? '撰写回复...' : '撰写评论...'}
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
      {loading ? (
        <div className="x-comments-loading" style={{ padding: '12px 0' }}>
          <div className="x-shimmer x-skeleton-line short" style={{ marginBottom: 8 }} />
          <div className="x-shimmer x-skeleton-line medium" />
        </div>
      ) : comments.length === 0 ? (
        <div className="empty-state-sm">暂无回复，发表第一条观点吧~</div>
      ) : (
        <div className="comments-list x-thread-list">
          {comments.map((c) => (
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
                    {c.user_id.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="user-badge author-name">
                    {c.user_id.length > 12 ? `User-${c.user_id.slice(0, 6)}` : c.user_id}
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
                  onClick={() => setReplyTo(c.id)}
                >
                  回复
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
