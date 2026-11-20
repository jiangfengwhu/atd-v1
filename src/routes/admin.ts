import { Hono } from 'hono';
import { getDb } from '../db';
import {
  createAdminSession,
  ensureDefaultAdmin,
  requireAdminAuth,
} from '../services/admin-auth';
import {
  getSystemSettings,
  maskApiKey,
  sendEmailViaResend,
} from '../services/resend';
import { AdminUserRecord, AppVariables, Env } from '../types';
import {
  extractBearerToken,
  getCookieValue,
  hashPasswordPBKDF2,
  sha256Hex,
  verifyPasswordPBKDF2,
} from '../utils/crypto';

export const adminRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_EMAIL_REGEX = /^.+<[^\s@]+@[^\s@]+\.[^\s@]+>$/;

function isValidSenderEmail(val: string): boolean {
  const trimmed = val.trim();
  return SIMPLE_EMAIL_REGEX.test(trimmed) || DISPLAY_EMAIL_REGEX.test(trimmed);
}

// POST /api/v1/admin/login
adminRoute.post('/login', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_CREDENTIALS', message: 'Invalid JSON request body' },
      400
    );
  }

  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username || !password) {
    return c.json(
      { error: '400_INVALID_CREDENTIALS', message: '请输入管理员账号和密码' },
      400
    );
  }

  try {
    const db = getDb(c);
    await ensureDefaultAdmin(db);

    const admin = await db
      .prepare(
        `SELECT id, username, password_hash, password_salt, must_change_password, created_at, updated_at
         FROM admin_users WHERE username = ?`
      )
      .bind(username)
      .first<AdminUserRecord>();

    if (!admin) {
      return c.json(
        { error: '401_INVALID_CREDENTIALS', message: '管理员账号或密码错误' },
        401
      );
    }

    const valid = await verifyPasswordPBKDF2(
      password,
      admin.password_salt,
      admin.password_hash
    );

    if (!valid) {
      return c.json(
        { error: '401_INVALID_CREDENTIALS', message: '管理员账号或密码错误' },
        401
      );
    }

    const token = await createAdminSession(db, admin.id);
    c.header(
      'Set-Cookie',
      `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
    );

    return c.json(
      {
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          must_change_password: Boolean(admin.must_change_password),
        },
      },
      200
    );
  } catch (err: any) {
    console.error('Error in POST /admin/login:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Admin login failed' }, 500);
  }
});

// POST /api/v1/admin/logout
adminRoute.post('/logout', async (c) => {
  try {
    const bearer = extractBearerToken(c.req.header('Authorization'));
    const cookieToken = getCookieValue(c.req.header('Cookie'), 'admin_session');
    const rawToken = bearer || cookieToken;

    if (rawToken) {
      const db = getDb(c);
      const tokenHash = await sha256Hex(rawToken);
      await db
        .prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ?')
        .bind(new Date().toISOString(), tokenHash)
        .run();
    }

    c.header(
      'Set-Cookie',
      'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );
    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: '500_DB_ERROR', message: 'Admin logout failed' }, 500);
  }
});

// GET /api/v1/admin/settings
adminRoute.get('/settings', requireAdminAuth, async (c) => {
  const adminId = c.get('adminId')!;
  try {
    const db = getDb(c);
    const admin = await db
      .prepare('SELECT id, username, must_change_password FROM admin_users WHERE id = ?')
      .bind(adminId)
      .first<Pick<AdminUserRecord, 'id' | 'username' | 'must_change_password'>>();

    if (!admin) {
      return c.json(
        { error: '401_ADMIN_UNAUTHORIZED', message: 'Admin account not found' },
        401
      );
    }

    const settings = await getSystemSettings(db, c.env);

    const [
      usersCount,
      emailUsersCount,
      postsCount,
      mediaCount,
      commentsCount,
      likesCount,
      repostsCount,
      clicksSum,
    ] = await Promise.all([
      db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM user_auth_emails').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM posts').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM media_assets').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM comments').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM post_likes').first<{ c: number }>(),
      db.prepare('SELECT COUNT(*) as c FROM post_reposts').first<{ c: number }>(),
      db.prepare('SELECT COALESCE(SUM(views_count), 0) as c FROM post_views').first<{ c: number }>(),
    ]);

    return c.json(
      {
        admin: {
          id: admin.id,
          username: admin.username,
          must_change_password: Boolean(admin.must_change_password),
        },
        settings: {
          resend_api_key_configured: Boolean(settings.resend_api_key),
          resend_api_key_masked: maskApiKey(settings.resend_api_key),
          resend_from_email: settings.resend_from_email,
          site_name: settings.site_name,
          otp_expiry_minutes: settings.otp_expiry_minutes,
          max_images_per_post: settings.max_images_per_post,
        },
        stats: {
          users: usersCount?.c ?? 0,
          email_users: emailUsersCount?.c ?? 0,
          posts: postsCount?.c ?? 0,
          media: mediaCount?.c ?? 0,
          comments: commentsCount?.c ?? 0,
          likes: likesCount?.c ?? 0,
          reposts: repostsCount?.c ?? 0,
          clicks: clicksSum?.c ?? 0,
        },
      },
      200
    );
  } catch (err: any) {
    console.error('Error in GET /admin/settings:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Failed to load admin settings' }, 500);
  }
});

// PUT /api/v1/admin/settings
adminRoute.put('/settings', requireAdminAuth, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_SETTINGS', message: 'Invalid JSON request body' },
      400
    );
  }

  try {
    const db = getDb(c);
    const current = await getSystemSettings(db, c.env);

    const resendFromEmail =
      body?.resend_from_email !== undefined
        ? String(body.resend_from_email).trim()
        : current.resend_from_email;

    const siteName =
      body?.site_name !== undefined ? String(body.site_name).trim() : current.site_name;

    const otpExpiryMinutes =
      body?.otp_expiry_minutes !== undefined
        ? Number(body.otp_expiry_minutes)
        : current.otp_expiry_minutes;

    const maxImagesPerPost =
      body?.max_images_per_post !== undefined
        ? Number(body.max_images_per_post)
        : current.max_images_per_post;

    if (!resendFromEmail || !isValidSenderEmail(resendFromEmail)) {
      return c.json(
        { error: '400_INVALID_SETTINGS', message: '发件人邮箱格式无效' },
        400
      );
    }

    if (!siteName || siteName.length > 64) {
      return c.json(
        { error: '400_INVALID_SETTINGS', message: '站点名称不能为空且不超过 64 个字符' },
        400
      );
    }

    if (
      !Number.isInteger(otpExpiryMinutes) ||
      otpExpiryMinutes < 1 ||
      otpExpiryMinutes > 1440
    ) {
      return c.json(
        {
          error: '400_INVALID_SETTINGS',
          message: '验证码有效期必须在 1 到 1440 分钟之间',
        },
        400
      );
    }

    if (
      !Number.isInteger(maxImagesPerPost) ||
      maxImagesPerPost < 1 ||
      maxImagesPerPost > 4
    ) {
      return c.json(
        {
          error: '400_INVALID_SETTINGS',
          message: '单帖最多图片数量必须在 1 到 4 张之间',
        },
        400
      );
    }

    let nextApiKey = current.resend_api_key;
    if (body?.clear_resend_api_key === true) {
      nextApiKey = '';
    } else if (
      typeof body?.resend_api_key === 'string' &&
      body.resend_api_key.trim().length > 0
    ) {
      nextApiKey = body.resend_api_key.trim();
    }

    const now = new Date().toISOString();
    const pairs: Array<[string, string]> = [
      ['resend_api_key', nextApiKey],
      ['resend_from_email', resendFromEmail],
      ['site_name', siteName],
      ['otp_expiry_minutes', String(otpExpiryMinutes)],
      ['max_images_per_post', String(maxImagesPerPost)],
    ];

    for (const [key, value] of pairs) {
      await db
        .prepare(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .bind(key, value, now)
        .run();
    }

    return c.json(
      {
        success: true,
        settings: {
          resend_api_key_configured: Boolean(nextApiKey),
          resend_api_key_masked: maskApiKey(nextApiKey),
          resend_from_email: resendFromEmail,
          site_name: siteName,
          otp_expiry_minutes: otpExpiryMinutes,
          max_images_per_post: maxImagesPerPost,
        },
      },
      200
    );
  } catch (err: any) {
    console.error('Error in PUT /admin/settings:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Failed to save settings' }, 500);
  }
});

// POST /api/v1/admin/settings/test-email
adminRoute.post('/settings/test-email', requireAdminAuth, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_EMAIL', message: 'Invalid JSON request body' },
      400
    );
  }

  const toEmail = typeof body?.to_email === 'string' ? body.to_email.trim() : '';
  if (!toEmail || !SIMPLE_EMAIL_REGEX.test(toEmail)) {
    return c.json(
      { error: '400_INVALID_EMAIL', message: '请输入有效的测试收件邮箱地址' },
      400
    );
  }

  try {
    const db = getDb(c);
    const settings = await getSystemSettings(db, c.env);

    if (!settings.resend_api_key) {
      return c.json(
        {
          error: '503_EMAIL_NOT_CONFIGURED',
          message: '尚未配置 Resend API Key，请先保存有效 Key',
        },
        503
      );
    }

    const result = await sendEmailViaResend({
      apiKey: settings.resend_api_key,
      from: settings.resend_from_email,
      to: toEmail,
      subject: `[${settings.site_name}] Resend 邮件服务测试`,
      text: `这是一封来自 ${settings.site_name} 管理后台的测试邮件，表明您的 Resend 配置正常工作。`,
      html: `<p>这是一封来自 <strong>${settings.site_name}</strong> 管理后台的测试邮件，表明您的 Resend 邮件服务配置已成功连通。</p>`,
    });

    if (!result.ok) {
      return c.json(
        {
          error: '502_EMAIL_SEND_FAILED',
          message: result.message || '测试邮件发送失败',
        },
        502
      );
    }

    return c.json(
      {
        success: true,
        provider_id: result.id || 'sent',
      },
      200
    );
  } catch (err: any) {
    console.error('Error in POST /admin/settings/test-email:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Failed to send test email' }, 500);
  }
});

// PUT /api/v1/admin/credentials
adminRoute.put('/credentials', requireAdminAuth, async (c) => {
  const adminId = c.get('adminId')!;
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: '400_INVALID_CREDENTIALS', message: 'Invalid JSON request body' },
      400
    );
  }

  const currentPassword =
    typeof body?.current_password === 'string' ? body.current_password : '';
  const newPassword =
    typeof body?.new_password === 'string' ? body.new_password : '';
  const newUsername =
    typeof body?.new_username === 'string' ? body.new_username.trim() : undefined;

  if (!currentPassword || newPassword.length < 6) {
    return c.json(
      {
        error: '400_INVALID_CREDENTIALS',
        message: '请输入当前密码且新密码长度不少于 6 位',
      },
      400
    );
  }

  if (newUsername !== undefined && newUsername.length < 2) {
    return c.json(
      {
        error: '400_INVALID_CREDENTIALS',
        message: '新管理员用户名至少需要 2 个字符',
      },
      400
    );
  }

  try {
    const db = getDb(c);
    const admin = await db
      .prepare('SELECT * FROM admin_users WHERE id = ?')
      .bind(adminId)
      .first<AdminUserRecord>();

    if (!admin) {
      return c.json(
        { error: '401_ADMIN_UNAUTHORIZED', message: 'Admin not found' },
        401
      );
    }

    const valid = await verifyPasswordPBKDF2(
      currentPassword,
      admin.password_salt,
      admin.password_hash
    );

    if (!valid) {
      return c.json(
        { error: '403_WRONG_PASSWORD', message: '当前密码验证失败' },
        403
      );
    }

    const targetUsername = newUsername || admin.username;
    if (targetUsername !== admin.username) {
      const conflict = await db
        .prepare('SELECT id FROM admin_users WHERE username = ? AND id != ?')
        .bind(targetUsername, adminId)
        .first<{ id: string }>();
      if (conflict) {
        return c.json(
          { error: '400_INVALID_CREDENTIALS', message: '该管理员用户名已被占用' },
          400
        );
      }
    }

    const { hash, salt } = await hashPasswordPBKDF2(newPassword);
    const now = new Date().toISOString();

    await db
      .prepare(
        `UPDATE admin_users
         SET username = ?, password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ?
         WHERE id = ?`
      )
      .bind(targetUsername, hash, salt, now, adminId)
      .run();

    return c.json(
      {
        success: true,
        admin: {
          id: admin.id,
          username: targetUsername,
          must_change_password: false,
        },
      },
      200
    );
  } catch (err: any) {
    console.error('Error in PUT /admin/credentials:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to update admin credentials' },
      500
    );
  }
});
