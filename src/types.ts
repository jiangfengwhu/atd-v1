import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';

export interface AssetsFetcher {
  fetch(input: Request | URL | string): Promise<Response>;
}

export interface Bindings {
  DB: D1Database;
  USER_REALTIME?: DurableObjectNamespace;
  ASSETS?: AssetsFetcher;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ALLOW_DEV_OTP_FALLBACK?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  avatarSeed: string;
  avatarUrl: string;
  bio: string;
  createdAt: string;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    user: AuthUser | null;
  };
}
