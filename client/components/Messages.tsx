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

    if (!targetRecipient) {
      setErrorMsg('收件人不能为空');
      return;
    }

    if (!targetContent) {
      setErrorMsg('私信内容不能为空');
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
      if (err.status === 404 || (err.data && err.data.error === '404_USER_NOT_FOUND')) {
        setErrorMsg('用户未找到，收件人不存在 (404_USER_NOT_FOUND)');
      } else {
        setErrorMsg(err.message || '发送失败，请稍后重试');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="messages-container">
      {/* Compose Message Card */}
      <div className="card message-compose-card">
        <h3 className="section-title">发送站内信 (Direct Message)</h3>

        <form onSubmit={handleSend} className="message-form">
          <div className="form-group">
            <label htmlFor="recipient" className="form-label">
              收件人 (Recipient ID)
            </label>
            <input
              id="recipient"
              type="text"
              className="input-field"
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
              className="textarea-field"
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
            <div className="error-banner" role="alert">
              ⚠️ {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="success-banner" role="status">
              ✅ {successMsg}
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSending}
            >
              {isSending ? '发送中...' : '发送'}
            </button>
          </div>
        </form>
      </div>

      {/* Message History */}
      <div className="card message-history-card">
        <div className="history-header">
          <h3 className="section-title">消息记录</h3>
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
          <div className="loading-card">加载消息记录中...</div>
        ) : messageHistory.length === 0 ? (
          <div className="empty-card">暂无私信往来</div>
        ) : (
          <div className="message-list">
            {messageHistory.map((msg) => {
              const isOutgoing = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`message-bubble-wrapper ${
                    isOutgoing ? 'outgoing' : 'incoming'
                  }`}
                >
                  <div className="message-peer-info">
                    {isOutgoing ? `发给: ${msg.recipient_id}` : `来自: ${msg.sender_id}`}
                    <span className="msg-timestamp">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="message-bubble">{msg.content}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
