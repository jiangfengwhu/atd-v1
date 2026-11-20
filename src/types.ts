export interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export interface AppVariables {
  userId: string;
  fingerprint: string;
  authType: 'email' | 'fingerprint';
  userEmail?: string | null;
  adminId?: string;
  adminUsername?: string;
}

export interface UserRecord {
  id: string;
  username: string;
  created_at: string;
  email?: string | null;
}

export interface MediaAssetRecord {
  id: string;
  user_id: string;
  mime_type: string;
  size_bytes: number;
  data_base64: string;
  filename: string | null;
  created_at: string;
}

export interface PostImageItem {
  id: string;
  url: string;
  mime_type: string;
}

export interface PostRecord {
  id: string;
  user_id: string;
  author_name?: string;
  content: string;
  created_at: string;
  images?: PostImageItem[];
  clicks_count?: number;
  views_count?: number;
  likes_count?: number;
  reposts_count?: number;
  comments_count?: number;
  reply_count?: number;
  user_liked?: number | boolean;
  user_reposted?: number | boolean;
}

export interface CommentRecord {
  id: string;
  post_id: string;
  user_id: string;
  author_name?: string;
  parent_id: string | null;
  content: string;
  created_at: string;
}

export interface MessageRecord {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
}

export interface PostLikeRecord {
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface PostRepostRecord {
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface PostViewRecord {
  post_id: string;
  views_count: number;
}

export interface EmailOtpRecord {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
  created_at: string;
}

export interface UserSessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface AdminUserRecord {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  must_change_password: number;
  created_at: string;
  updated_at: string;
}

export interface AdminSessionRecord {
  id: string;
  admin_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface SystemSettingRecord {
  key: string;
  value: string;
  updated_at: string;
}
