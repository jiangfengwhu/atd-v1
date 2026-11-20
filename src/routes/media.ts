import { Hono } from 'hono';
import { getDb } from '../db';
import { requireAuth } from '../middleware/auth';
import { AppVariables, Env, MediaAssetRecord } from '../types';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../utils/crypto';

export const mediaRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// 2 MB per image (keeps D1 & SQLite storage healthy while rejecting oversized uploads)
const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
const VALID_MEDIA_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function normalizeMimeType(mime: string): string {
  const clean = (mime || '').split(';')[0].trim().toLowerCase();
  if (clean === 'image/jpg') return 'image/jpeg';
  return clean;
}

// POST /api/v1/media/upload
mediaRoute.post('/media/upload', requireAuth, async (c) => {
  const userId = c.get('userId');
  const contentType = (c.req.header('content-type') || '').toLowerCase();

  let mimeType = '';
  let sizeBytes = 0;
  let dataBase64 = '';
  let filename: string | null = null;

  try {
    if (contentType.includes('multipart/form-data')) {
      const contentLengthHeader = c.req.header('content-length');
      if (contentLengthHeader) {
        const len = parseInt(contentLengthHeader, 10);
        if (!isNaN(len) && len > MAX_MEDIA_BYTES + 128 * 1024) {
          return c.json(
            {
              error: '413_MEDIA_TOO_LARGE',
              message: `图片大小不能超过 ${Math.floor(MAX_MEDIA_BYTES / (1024 * 1024))}MB`,
            },
            413
          );
        }
      }

      const body = await c.req.parseBody();
      const file = body['file'];
      if (!file || typeof file === 'string') {
        return c.json(
          { error: '400_INVALID_MEDIA', message: '请上传有效的图片文件 (file)' },
          400
        );
      }

      mimeType = normalizeMimeType(file.type);
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return c.json(
          {
            error: '400_INVALID_MEDIA',
            message: '仅支持 JPEG、PNG、WebP 或 GIF 格式图片',
          },
          400
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      sizeBytes = arrayBuffer.byteLength;
      if (sizeBytes === 0) {
        return c.json(
          { error: '400_INVALID_MEDIA', message: '图片文件内容不能为空' },
          400
        );
      }
      if (sizeBytes > MAX_MEDIA_BYTES) {
        return c.json(
          {
            error: '413_MEDIA_TOO_LARGE',
            message: `图片大小不能超过 ${Math.floor(MAX_MEDIA_BYTES / (1024 * 1024))}MB`,
          },
          413
        );
      }

      filename = file.name || null;
      dataBase64 = uint8ArrayToBase64(new Uint8Array(arrayBuffer));
    } else {
      let jsonBody: any;
      try {
        jsonBody = await c.req.json();
      } catch {
        return c.json(
          { error: '400_INVALID_MEDIA', message: 'Invalid upload request payload' },
          400
        );
      }

      const dataUrl = typeof jsonBody?.data_url === 'string' ? jsonBody.data_url.trim() : '';
      filename =
        typeof jsonBody?.filename === 'string' && jsonBody.filename.trim()
          ? jsonBody.filename.trim().slice(0, 128)
          : null;

      const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/is);
      if (!match) {
        return c.json(
          { error: '400_INVALID_MEDIA', message: '无效的图片 data_url 格式' },
          400
        );
      }

      mimeType = normalizeMimeType(match[1]);
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return c.json(
          {
            error: '400_INVALID_MEDIA',
            message: '仅支持 JPEG、PNG、WebP 或 GIF 格式图片',
          },
          400
        );
      }

      const rawB64 = match[2].replace(/\s+/g, '');
      if (
        !rawB64 ||
        rawB64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(rawB64)
      ) {
        return c.json(
          { error: '400_INVALID_MEDIA', message: '图片 Base64 编码无效' },
          400
        );
      }

      const decoded = base64ToUint8Array(rawB64);
      sizeBytes = decoded.byteLength;
      if (sizeBytes === 0) {
        return c.json(
          { error: '400_INVALID_MEDIA', message: '图片内容不能为空' },
          400
        );
      }
      if (sizeBytes > MAX_MEDIA_BYTES) {
        return c.json(
          {
            error: '413_MEDIA_TOO_LARGE',
            message: `图片大小不能超过 ${Math.floor(MAX_MEDIA_BYTES / (1024 * 1024))}MB`,
          },
          413
        );
      }

      dataBase64 = rawB64;
    }

    const db = getDb(c);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO media_assets (id, user_id, mime_type, size_bytes, data_base64, filename, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, userId, mimeType, sizeBytes, dataBase64, filename, createdAt)
      .run();

    return c.json(
      {
        id,
        url: `/api/v1/media/${id}`,
        mime_type: mimeType,
        size_bytes: sizeBytes,
      },
      201
    );
  } catch (err: any) {
    console.error('Error in POST /media/upload:', err);
    return c.json(
      { error: '500_DB_ERROR', message: 'Failed to store uploaded media' },
      500
    );
  }
});

// GET /api/v1/media/:id
mediaRoute.get('/media/:id', async (c) => {
  const id = c.req.param('id');
  if (!id || !VALID_MEDIA_ID_REGEX.test(id)) {
    return c.json({ error: '404_MEDIA_NOT_FOUND', message: 'Media not found' }, 404);
  }

  try {
    const db = getDb(c);
    const asset = await db
      .prepare('SELECT id, mime_type, data_base64 FROM media_assets WHERE id = ?')
      .bind(id)
      .first<Pick<MediaAssetRecord, 'id' | 'mime_type' | 'data_base64'>>();

    if (!asset) {
      return c.json({ error: '404_MEDIA_NOT_FOUND', message: 'Media not found' }, 404);
    }

    const bytes = base64ToUint8Array(asset.data_base64);
    const bodyBytes = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    return new Response(bodyBytes, {
      status: 200,
      headers: {
        'Content-Type': asset.mime_type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (err: any) {
    console.error('Error in GET /media/:id:', err);
    return c.json({ error: '500_DB_ERROR', message: 'Failed to retrieve media' }, 500);
  }
});
