import type { D1Database } from '@cloudflare/workers-types';
import { hashPasswordPBKDF2 } from './crypto';

export interface AdminConfigRow {
  id: number;
  password_hash: string;
  is_default_password: number;
  resend_api_key: string;
  resend_from_email: string;
  site_name: string;
  failed_attempts: number;
  locked_until: string | null;
  updated_at: string;
}

export async function ensureAdminConfig(db: D1Database): Promise<AdminConfigRow> {
  const existing = await db
    .prepare('SELECT * FROM admin_config WHERE id = 1')
    .first<AdminConfigRow>();
  if (existing) {
    return existing;
  }

  const defaultHash = await hashPasswordPBKDF2('admin');
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO admin_config
       (id, password_hash, is_default_password, resend_api_key, resend_from_email, site_name, failed_attempts, locked_until, updated_at)
       VALUES (1, ?, 1, '', 'onboarding@resend.dev', '拾光集 · 轻图文社区', 0, NULL, ?)`
    )
    .bind(defaultHash, now)
    .run();

  const row = await db
    .prepare('SELECT * FROM admin_config WHERE id = 1')
    .first<AdminConfigRow>();
  if (!row) {
    throw new Error('Failed to initialize admin_config');
  }
  return row;
}
