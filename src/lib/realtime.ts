import type { Bindings } from '../types';

export type RealtimeServerEvent =
  | { type: 'notification:new'; notification: unknown; unreadCount: number }
  | { type: 'notification:read'; unreadCount: number; ids?: string[]; all?: boolean }
  | {
      type: 'dm:new';
      message: {
        id: string;
        conversationKey: string;
        senderId: string;
        receiverId: string;
        content: string;
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
