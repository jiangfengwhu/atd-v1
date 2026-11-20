import { DatabaseAdapter } from '../db';
import { Env, SystemSettingRecord } from '../types';

export interface SystemSettingsMap {
  resend_api_key: string;
  resend_from_email: string;
  site_name: string;
  otp_expiry_minutes: number;
  max_images_per_post: number;
}

export const DEFAULT_SETTINGS: SystemSettingsMap = {
  resend_api_key: '',
  resend_from_email: 'onboarding@resend.dev',
  site_name: 'Pulse 社区',
  otp_expiry_minutes: 10,
  max_images_per_post: 4,
};

export function maskApiKey(apiKey: string): string {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '****';
  return `****${trimmed.slice(-4)}`;
}

export async function getSystemSettings(
  db: DatabaseAdapter,
  env?: Partial<Env>
): Promise<SystemSettingsMap> {
  const res = await db
    .prepare('SELECT key, value FROM system_settings')
    .all<SystemSettingRecord>();

  const raw: Record<string, string> = {};
  for (const row of res.results || []) {
    raw[row.key] = row.value;
  }

  const dbApiKey = (raw.resend_api_key ?? '').trim();
  const envApiKey = (env?.RESEND_API_KEY ?? '').trim();
  const dbFromEmail = (raw.resend_from_email ?? '').trim();
  const envFromEmail = (env?.RESEND_FROM_EMAIL ?? '').trim();

  const parsedOtp = parseInt(raw.otp_expiry_minutes ?? '', 10);
  const parsedMaxImages = parseInt(raw.max_images_per_post ?? '', 10);

  return {
    resend_api_key: dbApiKey || envApiKey || '',
    resend_from_email: dbFromEmail || envFromEmail || DEFAULT_SETTINGS.resend_from_email,
    site_name: (raw.site_name ?? '').trim() || DEFAULT_SETTINGS.site_name,
    otp_expiry_minutes:
      !isNaN(parsedOtp) && parsedOtp >= 1 && parsedOtp <= 1440
        ? parsedOtp
        : DEFAULT_SETTINGS.otp_expiry_minutes,
    max_images_per_post:
      !isNaN(parsedMaxImages) && parsedMaxImages >= 1 && parsedMaxImages <= 4
        ? parsedMaxImages
        : DEFAULT_SETTINGS.max_images_per_post,
  };
}

export interface SendResendEmailParams {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResendEmailResult {
  ok: boolean;
  id?: string;
  status?: number;
  message?: string;
}

export async function sendEmailViaResend(
  params: SendResendEmailParams
): Promise<SendResendEmailResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    const data = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
      name?: string;
    } | null;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: data?.message || `Resend API error (${response.status})`,
      };
    }

    return {
      ok: true,
      id: data?.id || 'sent',
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      message: err?.message || 'Failed to reach Resend email service',
    };
  }
}
