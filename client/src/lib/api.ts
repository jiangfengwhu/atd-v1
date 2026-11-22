export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatarSeed: string;
  createdAt?: string;
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
  author: {
    id: string;
    nickname: string;
    avatarSeed: string;
  };
  createdAt: string;
}

export interface CommentItem {
  id: string;
  content: string;
  author: {
    id: string;
    nickname: string;
    avatarSeed: string;
  };
  createdAt: string;
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

  updateProfile: (nickname: string) =>
    requestJson<{ ok: true; user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    }),

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
