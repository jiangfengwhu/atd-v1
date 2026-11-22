import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getSessionUser } from './auth';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  detectImageMimeFromMagicBytes,
} from '../lib/validation';

function decodeBase64(base64Input: string): Uint8Array | null {
  try {
    const cleaned = base64Input.includes(',') ? base64Input.split(',')[1] : base64Input;
    const binary = atob(cleaned.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function toUint8Array(data: unknown): Uint8Array | null {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post('/', async (c) => {
  const user = await getSessionUser(c.env.DB, c.req.header('cookie'));
  if (!user) {
    return c.json({ error: '请先登录后再上传图片' }, 401);
  }

  const contentType = (c.req.header('content-type') || '').toLowerCase();
  let filename = 'image';
  let declaredMime = '';
  let bytes: Uint8Array | null = null;

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!(file instanceof File)) {
      return c.json({ error: '请选择要上传的图片文件' }, 400);
    }
    filename = (file.name || 'image').slice(0, 120);
    declaredMime = file.type.toLowerCase();
    if (file.size > MAX_IMAGE_BYTES) {
      return c.json({ error: '图片大小不能超过 2MB' }, 413);
    }
    if (file.size === 0) {
      return c.json({ error: '上传文件为空' }, 400);
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  } else if (contentType.includes('application/json')) {
    const body = await c.req
      .json<{ filename?: unknown; mimeType?: unknown; dataBase64?: unknown }>()
      .catch(() => null);
    if (!body || typeof body.dataBase64 !== 'string' || typeof body.mimeType !== 'string') {
      return c.json({ error: '请求体缺少图片数据或 MIME 类型' }, 400);
    }
    filename =
      typeof body.filename === 'string' && body.filename.trim()
        ? body.filename.trim().slice(0, 120)
        : 'image';
    declaredMime = body.mimeType.trim().toLowerCase();
    bytes = decodeBase64(body.dataBase64);
    if (!bytes || bytes.length === 0) {
      return c.json({ error: '图片 Base64 数据无效' }, 400);
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      return c.json({ error: '图片大小不能超过 2MB' }, 413);
    }
  } else {
    return c.json({ error: '不支持的上传格式，请使用 multipart/form-data 或 JSON' }, 400);
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(declaredMime)) {
    return c.json({ error: '仅支持 PNG、JPEG、WEBP 或 GIF 格式图片' }, 400);
  }

  const detectedMime = detectImageMimeFromMagicBytes(bytes);
  if (!detectedMime || !ALLOWED_IMAGE_MIME_TYPES.has(detectedMime)) {
    return c.json({ error: '文件内容不是合法的图片格式' }, 400);
  }

  const assetId = crypto.randomUUID().replace(/-/g, '');
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO media_assets (id, uploader_id, filename, mime_type, size_bytes, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(assetId, user.id, filename, detectedMime, bytes.byteLength, bytes, nowIso)
    .run();

  return c.json(
    {
      ok: true,
      id: assetId,
      url: `/api/uploads/${assetId}`,
      mimeType: detectedMime,
      sizeBytes: bytes.byteLength,
    },
    201
  );
});

uploadRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    'SELECT mime_type, data FROM media_assets WHERE id = ? LIMIT 1'
  )
    .bind(id)
    .first<{ mime_type: string; data: unknown }>();

  if (!row) {
    return c.json({ error: '图片资源不存在' }, 404);
  }

  const bytes = toUint8Array(row.data);
  if (!bytes) {
    return c.json({ error: '图片数据损坏' }, 500);
  }

  const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(arrayBuf, {
    status: 200,
    headers: {
      'Content-Type': row.mime_type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});
