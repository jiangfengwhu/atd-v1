import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';

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
      setError('评论内容不能为空');
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

  return (
    <div className="comments-section">
      <h4 className="comments-title">评论互动 ({comments.length})</h4>

      <form onSubmit={handleSubmit} className="comment-form">
        {replyTo && (
          <div className="replying-banner">
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
        <div className="comment-input-row">
          <input
            type="text"
            className="input-field"
            placeholder={replyTo ? '撰写回复...' : '撰写评论...'}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (error) setError('');
            }}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={submitting}
          >
            {submitting ? '发送中...' : '回复'}
          </button>
        </div>
        {error && <div className="error-message">{error}</div>}
      </form>

      {loading ? (
        <div className="loading-spinner">加载评论中...</div>
      ) : comments.length === 0 ? (
        <div className="empty-state-sm">暂无评论，来抢沙发吧~</div>
      ) : (
        <div className="comments-list">
          {comments.map((c) => (
            <div
              key={c.id}
              className={`comment-item ${c.parent_id ? 'nested-reply' : ''}`}
            >
              <div className="comment-header">
                <span className="user-badge">{c.user_id}</span>
                <span className="timestamp">
                  {new Date(c.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="comment-content">{c.content}</div>
              <div className="comment-actions">
                <button
                  type="button"
                  className="btn-link"
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
