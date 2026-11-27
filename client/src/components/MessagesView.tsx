import * as React from 'react';
import { Loader2, MessageSquare, Send, RefreshCw } from 'lucide-react';
import {
  api,
  ApiError,
  type ConversationItem,
  type DirectMessageItem,
  type UserProfile,
} from '@/lib/api';
import { realtimeClient } from '@/lib/realtime';
import { AvatarBadge } from '@/components/AvatarBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatRelativeTime } from '@/lib/utils';

interface PeerSummary {
  id: string;
  nickname: string;
  avatarSeed: string;
  avatarUrl: string;
  bio: string;
}

interface MessagesViewProps {
  currentUser: UserProfile;
  initialPeerId?: string | null;
  onOpenUserProfile: (userId: string) => void;
  onUnreadUpdated: (totalUnread: number) => void;
}

export function MessagesView({
  currentUser,
  initialPeerId,
  onOpenUserProfile,
  onUnreadUpdated,
}: MessagesViewProps) {
  const [conversations, setConversations] = React.useState<ConversationItem[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);

  const [activePeerId, setActivePeerId] = React.useState<string | null>(initialPeerId ?? null);
  const [activePeer, setActivePeer] = React.useState<PeerSummary | null>(null);
  const [messages, setMessages] = React.useState<DirectMessageItem[]>([]);
  const [loadingThread, setLoadingThread] = React.useState(false);
  const [threadError, setThreadError] = React.useState<string | null>(null);

  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (initialPeerId) {
      setActivePeerId(initialPeerId);
    }
  }, [initialPeerId]);

  const loadConversations = React.useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoadingList(true);
        setListError(null);
      }
      try {
        const res = await api.listConversations();
        setConversations(res.conversations);
        onUnreadUpdated(res.totalUnread);
      } catch (err) {
        if (!silent) {
          setListError(err instanceof ApiError ? err.message : '加载私信列表失败');
        }
      } finally {
        if (!silent) setLoadingList(false);
      }
    },
    [onUnreadUpdated]
  );

  const loadThread = React.useCallback(
    async (peerId: string, silent = false) => {
      if (!silent) {
        setLoadingThread(true);
        setThreadError(null);
      }
      try {
        const res = await api.getMessagesWith(peerId);
        setActivePeer(res.peer);
        setMessages(res.messages);
        // Clear unread badge for this conversation and refresh global unread count
        setConversations((prev) =>
          prev.map((conv) => (conv.peer.id === peerId ? { ...conv, unreadCount: 0 } : conv))
        );
        const refreshed = await api.listConversations().catch(() => null);
        if (refreshed) {
          setConversations(refreshed.conversations);
          onUnreadUpdated(refreshed.totalUnread);
        }
      } catch (err) {
        if (!silent) {
          setThreadError(err instanceof ApiError ? err.message : '加载聊天记录失败');
        }
      } finally {
        if (!silent) setLoadingThread(false);
      }
    },
    [onUnreadUpdated]
  );

  React.useEffect(() => {
    loadConversations(false);
  }, [loadConversations]);

  React.useEffect(() => {
    if (!activePeerId) {
      setActivePeer(null);
      setMessages([]);
      return;
    }
    loadThread(activePeerId, false);
  }, [activePeerId, loadThread]);

  React.useEffect(() => {
    return realtimeClient.subscribe((event) => {
      if (event.type === 'dm:new') {
        const msg = event.message;
        const peerId =
          msg.senderId === currentUser.id ? event.receiverId : msg.senderId;
        const isIncoming = msg.senderId === peerId;
        const isViewingThread = activePeerId === peerId;

        if (isViewingThread) {
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
          if (isIncoming) {
            api.markConversationRead(peerId).catch(() => {});
          }
        }

        let foundPeer = false;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.peer.id === peerId);
          if (idx === -1) {
            if (isIncoming && event.sender) {
              foundPeer = true;
              return [
                {
                  peer: event.sender,
                  lastMessage: {
                    id: msg.id,
                    senderId: msg.senderId,
                    content: msg.content,
                    createdAt: msg.createdAt,
                  },
                  unreadCount: isViewingThread ? 0 : 1,
                },
                ...prev,
              ];
            }
            return prev;
          }
          foundPeer = true;
          const existing = prev[idx];
          const updatedItem: ConversationItem = {
            ...existing,
            lastMessage: {
              id: msg.id,
              senderId: msg.senderId,
              content: msg.content,
              createdAt: msg.createdAt,
            },
            unreadCount:
              isIncoming && !isViewingThread
                ? existing.unreadCount + 1
                : isViewingThread
                  ? 0
                  : existing.unreadCount,
          };
          const rest = prev.filter((c) => c.peer.id !== peerId);
          return [updatedItem, ...rest];
        });

        if (!foundPeer && !isIncoming) {
          loadConversations(true);
        }

        if (!(isIncoming && isViewingThread)) {
          onUnreadUpdated(event.totalUnread);
        }
      } else if (event.type === 'dm:read') {
        setConversations((prev) =>
          prev.map((conv) =>
            conv.peer.id === event.peerId ? { ...conv, unreadCount: 0 } : conv
          )
        );
        if (activePeerId === event.peerId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.senderId === currentUser.id ? { ...m, isRead: true } : m
            )
          );
        }
        onUnreadUpdated(event.totalUnread);
      }
    });
  }, [activePeerId, currentUser.id, loadConversations, onUnreadUpdated]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePeerId) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setThreadError(null);
    try {
      const res = await api.sendMessage(activePeerId, text);
      setMessages((prev) => [...prev, res.message]);
      setDraft('');
      loadConversations(true);
    } catch (err) {
      setThreadError(err instanceof ApiError ? err.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  // Ensure a newly initiated peer conversation is shown in the sidebar list even before first message
  const displayConversations = React.useMemo(() => {
    if (
      activePeer &&
      !conversations.some((c) => c.peer.id === activePeer.id)
    ) {
      const synthetic: ConversationItem = {
        peer: activePeer,
        lastMessage: {
          id: 'new',
          senderId: currentUser.id,
          content: '开始新的私信对话...',
          createdAt: new Date().toISOString(),
        },
        unreadCount: 0,
      };
      return [synthetic, ...conversations];
    }
    return conversations;
  }, [activePeer, conversations, currentUser.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 sm:text-2xl dark:text-slate-100">
            站内私信
          </h1>
          <p className="text-xs text-zinc-500 dark:text-slate-400">与社区创作者一对一交流灵感与故事</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => loadConversations(false)}
          className="h-8 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      <div className="grid min-h-[540px] grid-cols-1 overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-card md:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
        {/* Conversation list pane */}
        <div className="border-b border-zinc-100 md:col-span-4 md:border-b-0 md:border-r dark:border-slate-800">
          <div className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-500 dark:border-slate-800 dark:text-slate-400">
            会话列表 ({displayConversations.length})
          </div>

          {loadingList ? (
            <div className="flex h-60 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          ) : listError ? (
            <div className="p-6 text-center text-xs text-red-600 dark:text-red-400">{listError}</div>
          ) : displayConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <MessageSquare className="h-8 w-8 text-zinc-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-slate-300">还没有私信会话</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-slate-500">
                去动态流点击感兴趣的用户头像进入主页，即可发起私信
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 max-h-[490px] overflow-y-auto dark:divide-slate-800">
              {displayConversations.map((conv) => {
                const selected = conv.peer.id === activePeerId;
                return (
                  <li key={conv.peer.id}>
                    <button
                      type="button"
                      onClick={() => setActivePeerId(conv.peer.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3.5 text-left transition',
                        selected ? 'bg-blue-50/70 dark:bg-blue-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      )}
                    >
                      <AvatarBadge
                        nickname={conv.peer.nickname}
                        seed={conv.peer.avatarSeed}
                        avatarUrl={conv.peer.avatarUrl}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-zinc-900 dark:text-slate-100">
                            {conv.peer.nickname}
                          </span>
                          <span className="shrink-0 text-[10px] text-zinc-400 dark:text-slate-500">
                            {formatRelativeTime(conv.lastMessage.createdAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-zinc-500 dark:text-slate-400">
                            {conv.lastMessage.content}
                          </p>
                          {conv.unreadCount > 0 && (
                            <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Chat thread pane */}
        <div className="flex flex-col md:col-span-8">
          {!activePeerId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-zinc-400 dark:text-slate-500">
              <MessageSquare className="h-10 w-10 text-zinc-200 dark:text-slate-700" />
              <p className="mt-3 text-sm font-medium text-zinc-500 dark:text-slate-400">选择一个会话开始聊天</p>
            </div>
          ) : loadingThread && !activePeer ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
            </div>
          ) : (
            <>
              {activePeer && (
                <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => onOpenUserProfile(activePeer.id)}
                    className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                  >
                    <AvatarBadge
                      nickname={activePeer.nickname}
                      seed={activePeer.avatarSeed}
                      avatarUrl={activePeer.avatarUrl}
                      size="md"
                    />
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-slate-100">{activePeer.nickname}</p>
                      <p className="text-[11px] text-zinc-400 truncate max-w-[260px] dark:text-slate-500">
                        {activePeer.bio || '点击查看个人主页'}
                      </p>
                    </div>
                  </button>
                </div>
              )}

              <div className="flex-1 space-y-3 overflow-y-auto bg-zinc-50/50 p-5 max-h-[400px] dark:bg-slate-950/60">
                {messages.length === 0 ? (
                  <p className="py-12 text-center text-xs text-zinc-400 dark:text-slate-500">
                    还没有消息记录，发送第一句问候吧 👋
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.senderId === currentUser.id;
                    return (
                      <div
                        key={msg.id}
                        className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm',
                            isMine
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-800 border border-slate-200/70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                          )}
                        >
                          {msg.content}
                        </div>
                        <span className="mt-1 px-1 text-[10px] text-zinc-400 dark:text-slate-500">
                          {formatRelativeTime(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {threadError && (
                <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-400">
                  {threadError}
                </div>
              )}

              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-zinc-100 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="输入私信内容，按回车发送..."
                  maxLength={2000}
                  disabled={sending}
                />
                <Button
                  type="submit"
                  variant="gradient"
                  disabled={sending || !draft.trim()}
                  className="shrink-0 rounded-xl px-4"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  发送
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
