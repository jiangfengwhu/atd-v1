import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
}

interface MessagesProps {
  initialRecipient?: string;
  currentUserId: string;
}

export const Messages: React.FC<MessagesProps> = ({
  initialRecipient = '',
  currentUserId,
}) => {
  const [recipient, setRecipient] = useState(initialRecipient);
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (initialRecipient) {
      setRecipient(initialRecipient);
    }
  }, [initialRecipient]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await apiRequest<{ messages: Message[] }>('/api/v1/messages');
      setMessageHistory(data.messages || []);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const targetRecipient = recipient.trim();
    const targetContent = content.trim();

    if (!targetRecipient || !targetContent) {
      setErrorMsg('收件人和私信内容均不能为空 (required)');
      return;
    }

    setIsSending(true);

    try {
      await apiRequest('/api/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          recipient_id: targetRecipient,
          content: targetContent,
        }),
      });

      setSuccessMsg('私信发送成功！(Message sent successfully)');
      setContent('');
      await loadHistory();
    } catch (err: any) {
      console.error('Send message error:', err);
      if (
        err.status === 404 ||
        (err.data && err.data.error === '404_USER_NOT_FOUND') ||
        (err.message && err.message.includes('404'))
      ) {
        setErrorMsg('用户未找到，收件人不存在 (404_USER_NOT_FOUND)');
      } else {
        setErrorMsg(err.message || '发送失败，请稍后重试');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="messages-container x-messages-view x-fade-in-up">
      <div className="x-messages-header">
        <h2 className="x-messages-title">✉️ 站内信 (Direct Messages)</h2>
        <span className="x-messages-subtitle">
          安全点对点通信 · 基于浏览器指纹即时连接
        </span>
      </div>

      {/* Compose Form Card */}
      <div className="card message-compose-card x-dm-compose-card">
        <h3 className="section-title">发送新私信</h3>

        <form onSubmit={handleSend} className="message-form">
          <div className="form-group">
            <label htmlFor="recipient" className="form-label">
              收件人 (Recipient ID)
            </label>
            <input
              id="recipient"
              type="text"
              className="input-field x-thread-input"
              placeholder="输入目标用户的指纹 ID (例如: qa-fp-...)"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                if (errorMsg) setErrorMsg('');
                if (successMsg) setSuccessMsg('');
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="message" className="form-label">
              私信内容 (Message Content)
            </label>
            <textarea
              id="message"
              className="textarea-field x-dm-textarea"
              rows={3}
              placeholder="输入你想对Ta说的私信内容..."
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (errorMsg) setErrorMsg('');
                if (successMsg) setSuccessMsg('');
              }}
            />
          </div>

          {errorMsg && (
            <div className="error-banner x-fade-in-up" role="alert">
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="success-banner x-fade-in-up" role="status">
              ✅ {successMsg}
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary x-dm-send-btn x-btn-active"
              disabled={isSending}
            >
              {isSending ? '发送中...' : '发送'}
            </button>
          </div>
        </form>
      </div>

      {/* Message History */}
      <div className="card message-history-card">
        <div className="history-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="section-title" style={{ margin: 0 }}>会话记录</h3>
          <button
            type="button"
            className="btn-link"
            onClick={loadHistory}
            disabled={loadingHistory}
          >
            {loadingHistory ? '刷新中...' : '🔄 刷新'}
          </button>
        </div>

        {loadingHistory && messageHistory.length === 0 ? (
          <div className="x-skeletons-wrapper">
            <div className="x-shimmer x-skeleton-bubble outgoing" />
            <div className="x-shimmer x-skeleton-bubble incoming" />
          </div>
        ) : messageHistory.length === 0 ? (
          <div className="empty-card">
            <p>暂无私信往来，输入上方收件人指纹开始交流吧！</p>
          </div>
        ) : (
          <div className="message-list x-dm-bubble-list">
            {messageHistory.map((msg) => {
              const isOutgoing = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`message-bubble-wrapper x-dm-bubble-row ${
                    isOutgoing ? 'outgoing' : 'incoming'
                  } x-fade-in-up`}
                >
                  <div className="message-peer-info">
                    <span>{isOutgoing ? `发给: ${msg.recipient_id}` : `来自: ${msg.sender_id}`}</span>
                    <span className="msg-timestamp">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="message-bubble x-dm-bubble">{msg.content}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
