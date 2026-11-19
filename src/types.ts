export interface Env {
  DB: D1Database;
}

export interface AppVariables {
  userId: string;
  fingerprint: string;
}

export interface UserRecord {
  id: string;
  username: string;
  created_at: string;
}

export interface PostRecord {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  reply_count?: number;
  likes_count?: number;
  views_count?: number;
  user_liked?: number | boolean;
}

export interface CommentRecord {
  id: string;
  post_id: string;
  user_id: string;
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

export interface PostViewRecord {
  post_id: string;
  views_count: number;
}
