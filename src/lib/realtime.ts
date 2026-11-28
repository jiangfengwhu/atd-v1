import type { Bindings } from '../types';

export interface SharedPostAuthorSummary {
  id: string;
  nickname: string;
  avatarSeed: string;
  avatarUrl: string;
  isOfficial: boolean;
  officialBadge?: string;
}

export interface SharedPostSummary {
  id: string;
  unavailable: boolean;
  contentPreview: string;
  imageUrl: string;
  author: SharedPostAuthorSummary | null;
  createdAt: string | null;
}

export interface RealtimeUnreadByType {
  comment: number;
  like: number;
  follow: number;
}

export type RealtimeServerEvent =
  | {
      type: 'notification:new';
      notification: unknown;
      unreadCount: number;
      unreadByType?: RealtimeUnreadByType;
    }
  | {
      type: 'notification:read';
      unreadCount: number;
      unreadByType?: RealtimeUnreadByType;
      ids?: string[];
      all?: boolean;
      category?: 'comment' | 'like' | 'follow';
    }
  | {
      type: 'dm:new';
      message: {
        id: string;
        conversationKey: string;
        senderId: string;
        receiverId: string;
        content: string;
        sharedPost?: SharedPostSummary | null;
        isRead: boolean;
        createdAt: string;
      };
      sender: {
        id: string;
        nickname: string;
        avatarSeed: string;
        avatarUrl: string;
        bio: string;
      };
      receiverId: string;
      totalUnread: number;
    }
  | { type: 'dm:read'; peerId: string; totalUnread: number };

/**
 * Push a real-time event to a specific user's Durable Object hub.
 * Swallows transport errors so REST mutations remain resilient.
 */
export async function pushUserEvent(
  env: Pick<Bindings, 'USER_REALTIME'>,
  userId: string,
  event: RealtimeServerEvent
): Promise<void> {
  if (!env.USER_REALTIME || !userId) return;
  try {
    const id = env.USER_REALTIME.idFromName(userId);
    const stub = env.USER_REALTIME.get(id);
    await stub.fetch('https://realtime.internal/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error('Failed to push realtime event:', err);
  }
}
