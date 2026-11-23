export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatarSeed: string;
  avatarUrl?: string;
  bio?: string;
  createdAt?: string;
}

export interface PostAuthor {
  id: string;
  nickname: string;
  avatarSeed: string;
  avatarUrl?: string;
}

export interface PostItem {
  id: string;
  title: string;
  content: string;
  imageUrl: string;
  tags: string[];
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  author: PostAuthor;
  createdAt: string;
}

export interface CommentReplyItem {
  id: string;
  commentId: string;
  postId: string;
  content: string;
  author: PostAuthor;
  replyToUser: { id: string; nickname: string } | null;
  createdAt: string;
}

export interface CommentItem {
  id: string;
  content: string;
  author: PostAuthor;
  replies?: CommentReplyItem[];
  createdAt: string;
}

export interface PublicUserProfile {
  id: string;
  nickname: string;
  avatarSeed: string;
  avatarUrl: string;
  bio: string;
  email?: string;
  createdAt: string;
  postsCount: number;
  followingCount: number;
  followersCount: number;
  likesCount: number;
  commentsCount: number;
  repliesCount: number;
  isFollowing: boolean;
  isSelf: boolean;
}

export interface FollowUserItem {
  id: string;
  nickname: string;
  avatarSeed: string;
  avatarUrl: string;
  bio: string;
  isFollowing: boolean;
  followedAt: string;
}

export interface CommentActivityItem {
  id: string;
  postId: string;
  postTitle: string;
  content: string;
  author: PostAuthor;
  createdAt: string;
}

export interface ReplyActivityItem {
  id: string;
  commentId: string;
  postId: string;
  postTitle: string;
  parentCommentContent: string;
  content: string;
  direction: 'sent' | 'received';
  author: PostAuthor;
  replyToUser: { id: string; nickname: string } | null;
  createdAt: string;
}

export interface ConversationItem {
  peer: {
    id: string;
    nickname: string;
    avatarSeed: string;
    avatarUrl: string;
    bio: string;
  };
  lastMessage: {
    id: string;
    senderId: string;
    content: string;
    createdAt: string;
  };
  unreadCount: number;
}

export interface DirectMessageItem {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export type NotificationType = 'comment' | 'like' | 'follow';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  isRead: boolean;
  contentPreview: string;
  createdAt: string;
  actor: PostAuthor;
  post: {
    id: string;
    title: string;
    imageUrl: string;
  } | null;
  commentId: string | null;
}

export interface AdminSettings {
  hasResendApiKey: boolean;
  resendApiKeyMasked: string;
  resendFromEmail: string;
  siteName: string;
  stats: {
    usersCount: number;
    postsCount: number;
    commentsCount: number;
  };
  updatedAt: string;
}

export interface AdminPostItem {
  id: string;
  title: string;
  content: string;
  imageUrl: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  author: {
    id: string;
    nickname: string;
    email: string;
  };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof data.error === 'string' ? data.error : `请求失败 (${res.status})`
    );
  }
  return data as T;
}

export const api = {
  // Auth
  me: () =>
    requestJson<{ authenticated: boolean; user: UserProfile | null }>('/api/auth/me'),

  sendCode: (email: string) =>
    requestJson<{
      ok: true;
      expiresInSeconds: number;
      deliveryMode: 'resend' | 'dev_fallback';
      devCode?: string;
    }>('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyCode: (payload: { email: string; code: string; nickname?: string }) =>
    requestJson<{ ok: true; user: UserProfile }>('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => requestJson<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  updateProfile: (
    payload: string | { nickname?: string; bio?: string; avatarUrl?: string }
  ) =>
    requestJson<{ ok: true; user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(typeof payload === 'string' ? { nickname: payload } : payload),
    }),

  // Users & Social
  getUserProfile: (userId: string) =>
    requestJson<{ user: PublicUserProfile }>(`/api/users/${encodeURIComponent(userId)}`),

  toggleFollow: (userId: string) =>
    requestJson<{
      ok: true;
      following: boolean;
      followersCount: number;
      followingCount: number;
    }>(`/api/users/${encodeURIComponent(userId)}/follow`, {
      method: 'POST',
    }),

  getFollows: (
    userId: string,
    type: 'following' | 'followers',
    limit = 30,
    offset = 0
  ) =>
    requestJson<{
      type: 'following' | 'followers';
      users: FollowUserItem[];
      total: number;
    }>(
      `/api/users/${encodeURIComponent(userId)}/follows?type=${type}&limit=${limit}&offset=${offset}`
    ),

  getUserActivity: <T = PostItem | CommentActivityItem | ReplyActivityItem>(
    userId: string,
    tab: 'posts' | 'likes' | 'comments' | 'replies',
    limit = 24,
    offset = 0
  ) =>
    requestJson<{
      tab: 'posts' | 'likes' | 'comments' | 'replies';
      items: T[];
      total: number;
    }>(
      `/api/users/${encodeURIComponent(userId)}/activity?tab=${tab}&limit=${limit}&offset=${offset}`
    ),

  // Posts
  listPosts: (params: {
    q?: string;
    tag?: string;
    sort?: 'latest' | 'hot';
    limit?: number;
    offset?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.tag) sp.set('tag', params.tag);
    if (params.sort) sp.set('sort', params.sort);
    if (params.limit !== undefined) sp.set('limit', String(params.limit));
    if (params.offset !== undefined) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return requestJson<{ posts: PostItem[]; total: number; siteName?: string }>(
      `/api/posts${qs ? `?${qs}` : ''}`
    );
  },

  getPost: (id: string) =>
    requestJson<{ post: PostItem; comments: CommentItem[] }>(`/api/posts/${encodeURIComponent(id)}`),

  createPost: (payload: {
    title: string;
    content: string;
    imageUrl?: string;
    tags?: string[];
  }) =>
    requestJson<{ ok: true; post: PostItem }>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deletePost: (id: string) =>
    requestJson<{ ok: true }>(`/api/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  toggleLike: (id: string) =>
    requestJson<{ ok: true; liked: boolean; likesCount: number }>(
      `/api/posts/${encodeURIComponent(id)}/like`,
      { method: 'POST' }
    ),

  addComment: (id: string, content: string) =>
    requestJson<{ ok: true; comment: CommentItem & { postId: string } }>(
      `/api/posts/${encodeURIComponent(id)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      }
    ),

  addReply: (
    postId: string,
    commentId: string,
    content: string,
    replyToUserId?: string
  ) =>
    requestJson<{ ok: true; reply: CommentReplyItem }>(
      `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies`,
      {
        method: 'POST',
        body: JSON.stringify({
          content,
          ...(replyToUserId ? { replyToUserId } : {}),
        }),
      }
    ),

  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return requestJson<{ ok: true; id: string; url: string; mimeType: string; sizeBytes: number }>(
      '/api/uploads',
      {
        method: 'POST',
        body: form,
      }
    );
  },

  // Direct Messages
  listConversations: () =>
    requestJson<{ conversations: ConversationItem[]; totalUnread: number }>(
      '/api/messages/conversations'
    ),

  getMessagesWith: (peerId: string, limit = 50, offset = 0) =>
    requestJson<{
      peer: {
        id: string;
        nickname: string;
        avatarSeed: string;
        avatarUrl: string;
        bio: string;
      };
      messages: DirectMessageItem[];
    }>(`/api/messages/with/${encodeURIComponent(peerId)}?limit=${limit}&offset=${offset}`),

  sendMessage: (peerId: string, content: string) =>
    requestJson<{
      ok: true;
      message: DirectMessageItem & { conversationKey: string };
    }>(`/api/messages/with/${encodeURIComponent(peerId)}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  markConversationRead: (peerId: string) =>
    requestJson<{ ok: true; totalUnread: number }>(
      `/api/messages/with/${encodeURIComponent(peerId)}/read`,
      { method: 'POST' }
    ),

  // Notifications
  listNotifications: (params?: {
    type?: 'all' | NotificationType;
    limit?: number;
    offset?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params?.type) sp.set('type', params.type);
    if (params?.limit !== undefined) sp.set('limit', String(params.limit));
    if (params?.offset !== undefined) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return requestJson<{
      notifications: NotificationItem[];
      total: number;
      unreadCount: number;
    }>(`/api/notifications${qs ? `?${qs}` : ''}`);
  },

  getUnreadCount: () =>
    requestJson<{
      notificationsUnread: number;
      messagesUnread: number;
      totalUnread: number;
    }>('/api/notifications/unread-count'),

  markNotificationsRead: (payload: { all: true } | { ids: string[] }) =>
    requestJson<{ ok: true; unreadCount: number }>('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin
  adminMe: () =>
    requestJson<{ authenticated: boolean; mustChangeDefaultPassword?: boolean }>('/api/admin/me'),

  adminLogin: (password: string) =>
    requestJson<{ ok: true; mustChangeDefaultPassword: boolean }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  adminLogout: () => requestJson<{ ok: true }>('/api/admin/logout', { method: 'POST' }),

  adminChangePassword: (currentPassword: string, newPassword: string) =>
    requestJson<{ ok: true }>('/api/admin/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  adminGetSettings: () => requestJson<AdminSettings>('/api/admin/settings'),

  adminSaveSettings: (payload: {
    resendApiKey?: string;
    resendFromEmail?: string;
    siteName?: string;
  }) =>
    requestJson<{
      ok: true;
      hasResendApiKey: boolean;
      resendApiKeyMasked: string;
      resendFromEmail: string;
      siteName: string;
    }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  adminListPosts: () => requestJson<{ posts: AdminPostItem[] }>('/api/admin/posts'),

  adminDeletePost: (id: string) =>
    requestJson<{ ok: true }>(`/api/admin/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};
