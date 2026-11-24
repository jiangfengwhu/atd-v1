import * as React from 'react';
import {
  Bell,
  CheckCheck,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import {
  api,
  ApiError,
  type NotificationItem,
  type NotificationType,
  type UnreadByType,
} from '@/lib/api';
import { realtimeClient } from '@/lib/realtime';
import { AvatarBadge } from '@/components/AvatarBadge';
import { Button } from '@/components/ui/button';
import { cn, formatRelativeTime } from '@/lib/utils';

type FilterType = 'all' | NotificationType;

interface NotificationsViewProps {
  onUnreadUpdated: (unreadCount: number) => void;
  onOpenPost: (postId: string) => void;
  onOpenUserProfile: (userId: string) => void;
}

const FILTER_TABS: Array<{ value: FilterType; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'comment', label: '评论' },
  { value: 'like', label: '点赞' },
  { value: 'follow', label: '关注' },
];

const EMPTY_UNREAD_BY_TYPE: UnreadByType = { comment: 0, like: 0, follow: 0 };

function getTypeMeta(type: NotificationType) {
  switch (type) {
    case 'comment':
      return {
        label: '评论了你的动态',
        icon: MessageCircle,
        badgeClass: 'bg-blue-50 text-blue-600',
      };
    case 'like':
      return {
        label: '赞了你的动态',
        icon: Heart,
        badgeClass: 'bg-rose-50 text-rose-600',
      };
    case 'follow':
      return {
        label: '关注了你',
        icon: UserPlus,
        badgeClass: 'bg-emerald-50 text-emerald-600',
      };
  }
}

export function NotificationsView({
  onUnreadUpdated,
  onOpenPost,
  onOpenUserProfile,
}: NotificationsViewProps) {
  const [filter, setFilter] = React.useState<FilterType>('all');
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [unreadByType, setUnreadByType] = React.useState<UnreadByType>(EMPTY_UNREAD_BY_TYPE);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [markingAll, setMarkingAll] = React.useState(false);
  const requestSeqRef = React.useRef(0);

  const loadNotifications = React.useCallback(
    async (selectedFilter: FilterType) => {
      const seq = ++requestSeqRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await api.listNotifications({
          type: selectedFilter,
          limit: 50,
          offset: 0,
        });
        if (seq !== requestSeqRef.current) return;
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
        setUnreadByType(res.unreadByType ?? EMPTY_UNREAD_BY_TYPE);
        onUnreadUpdated(res.unreadCount);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        setError(err instanceof ApiError ? err.message : '加载通知失败，请稍后重试');
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [onUnreadUpdated]
  );

  // Initial load preserves unread red dots on category tabs
  React.useEffect(() => {
    loadNotifications('all');
  }, [loadNotifications]);

  React.useEffect(() => {
    return realtimeClient.subscribe((event) => {
      if (event.type === 'notification:new') {
        setUnreadCount(event.unreadCount);
        if (event.unreadByType) {
          setUnreadByType(event.unreadByType);
        } else {
          const notifType = event.notification.type;
          setUnreadByType((prev) => ({
            ...prev,
            [notifType]: prev[notifType] + 1,
          }));
        }
        onUnreadUpdated(event.unreadCount);
        if (filter === 'all' || filter === event.notification.type) {
          setNotifications((prev) => {
            const without = prev.filter((item) => item.id !== event.notification.id);
            return [event.notification, ...without];
          });
        }
      } else if (event.type === 'notification:read') {
        setUnreadCount(event.unreadCount);
        if (event.unreadByType) {
          setUnreadByType(event.unreadByType);
        } else if (event.all) {
          setUnreadByType(EMPTY_UNREAD_BY_TYPE);
        }
        onUnreadUpdated(event.unreadCount);
        if (event.all) {
          setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
        } else if (event.category) {
          setNotifications((prev) =>
            prev.map((item) =>
              item.type === event.category ? { ...item, isRead: true } : item
            )
          );
        } else if (event.ids && event.ids.length > 0) {
          const idSet = new Set(event.ids);
          setNotifications((prev) =>
            prev.map((item) => (idSet.has(item.id) ? { ...item, isRead: true } : item))
          );
        }
      }
    });
  }, [filter, onUnreadUpdated]);

  const handleSelectFilter = async (nextFilter: FilterType) => {
    const seq = ++requestSeqRef.current;
    setFilter(nextFilter);
    setLoading(true);
    setError(null);
    try {
      // Serially mark selected category as read first so list refresh never writes back stale unread state
      const readRes = await api.markNotificationsRead({ type: nextFilter });
      if (seq !== requestSeqRef.current) return;
      setUnreadCount(readRes.unreadCount);
      setUnreadByType(readRes.unreadByType ?? EMPTY_UNREAD_BY_TYPE);
      onUnreadUpdated(readRes.unreadCount);

      const listRes = await api.listNotifications({
        type: nextFilter,
        limit: 50,
        offset: 0,
      });
      if (seq !== requestSeqRef.current) return;
      setNotifications(listRes.notifications);
      setUnreadCount(listRes.unreadCount);
      setUnreadByType(listRes.unreadByType ?? EMPTY_UNREAD_BY_TYPE);
      onUnreadUpdated(listRes.unreadCount);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setError(err instanceof ApiError ? err.message : '加载通知失败，请稍后重试');
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      const res = await api.markNotificationsRead({ all: true });
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(res.unreadCount);
      setUnreadByType(res.unreadByType ?? EMPTY_UNREAD_BY_TYPE);
      onUnreadUpdated(res.unreadCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '标记已读失败');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleOpenNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      api
        .markNotificationsRead({ ids: [item.id] })
        .then((res) => {
          setUnreadCount(res.unreadCount);
          if (res.unreadByType) setUnreadByType(res.unreadByType);
          onUnreadUpdated(res.unreadCount);
        })
        .catch(() => {});
    }

    if (item.type === 'follow') {
      onOpenUserProfile(item.actor.id);
    } else if (item.post?.id) {
      onOpenPost(item.post.id);
    }
  };

  const getTabUnreadCount = (tab: FilterType) => {
    if (tab === 'all') return unreadCount;
    return unreadByType[tab] ?? 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              通知中心
            </h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
                {unreadCount} 条未读
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            点击对应分类即可一键标为已读
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={unreadCount === 0 || markingAll}
          onClick={handleMarkAllRead}
          className="h-9 rounded-full px-4 text-xs font-semibold"
        >
          {markingAll ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCheck className="h-3.5 w-3.5" />
          )}
          全部标为已读
        </Button>
      </div>

      {/* Category Filter Tabs with Per-Type Unread Red Dots */}
      <div
        role="tablist"
        aria-label="通知分类"
        className="inline-flex flex-wrap gap-1.5 rounded-full border border-slate-200/80 bg-white p-1.5 shadow-card"
      >
        {FILTER_TABS.map((tab) => {
          const tabUnread = getTabUnreadCount(tab.value);
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={filter === tab.value}
              onClick={() => handleSelectFilter(tab.value)}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition',
                filter === tab.value
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <span>{tab.label}</span>
              {tabUnread > 0 && (
                <span
                  aria-label={`${tab.label}有 ${tabUnread} 条未读`}
                  className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
                >
                  {tabUnread > 99 ? '99+' : tabUnread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-white py-14 px-6 text-center shadow-card">
          <p className="text-sm font-medium text-red-600">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadNotifications(filter)}
            className="mt-4"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </Button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white/80 py-20 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Bell className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900">暂无相关通知</h2>
          <p className="mt-1 text-xs text-slate-500">
            当有朋友点赞、评论你的动态或关注你时，这里会第一时间收到提醒
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {notifications.map((item) => {
            const meta = getTypeMeta(item.type);
            const Icon = meta.icon;
            return (
              <li key={item.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenNotification(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenNotification(item);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-4 transition',
                    item.isRead
                      ? 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      : 'border-blue-200/80 bg-blue-50/40 shadow-sm hover:bg-blue-50/60'
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!item.isRead) {
                          api
                            .markNotificationsRead({ ids: [item.id] })
                            .then((res) => {
                              setNotifications((prev) =>
                                prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
                              );
                              setUnreadCount(res.unreadCount);
                              if (res.unreadByType) setUnreadByType(res.unreadByType);
                              onUnreadUpdated(res.unreadCount);
                            })
                            .catch(() => {});
                        }
                        onOpenUserProfile(item.actor.id);
                      }}
                      className="relative shrink-0 mt-0.5"
                    >
                      <AvatarBadge
                        nickname={item.actor.nickname}
                        seed={item.actor.avatarSeed}
                        avatarUrl={item.actor.avatarUrl}
                        size="md"
                      />
                      {!item.isRead && (
                        <span
                          aria-label="未读"
                          className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                        />
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {item.actor.nickname}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            meta.badgeClass
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      {item.type === 'comment' && (
                        <>
                          {item.contentPreview && (
                            <p className="line-clamp-2 rounded-xl border border-slate-100 bg-white/90 px-3 py-1.5 text-sm text-slate-700">
                              {item.contentPreview}
                            </p>
                          )}
                          {item.post?.contentPreview && (
                            <p className="truncate text-xs text-slate-400">
                              原动态：{item.post.contentPreview}
                            </p>
                          )}
                        </>
                      )}

                      {item.type === 'like' && (
                        <p className="truncate text-xs text-slate-500">
                          {item.post?.contentPreview || item.contentPreview || '你的动态'}
                        </p>
                      )}

                      {item.type === 'follow' && (
                        <p className="text-xs text-slate-500">点击查看 TA 的个人主页</p>
                      )}

                      {item.type !== 'follow' && !item.post && (
                        <p className="text-[11px] text-slate-400">原动态已被删除</p>
                      )}
                    </div>
                  </div>

                  {item.post?.imageUrl && (
                    <img
                      src={item.post.imageUrl}
                      alt={item.post.contentPreview || '动态配图'}
                      className="h-14 w-14 shrink-0 rounded-xl border border-slate-200/70 object-cover"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
