import { Hono } from 'hono';
import type { AppEnv } from '../types';

export interface LinkPreviewResponse {
  ok: true;
  resolved: boolean;
  url: string;
  host: string;
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
}

const PREVIEW_CACHE_MAX = 200;
const PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const previewCache = new Map<string, { value: LinkPreviewResponse; expiresAt: number }>();

function isPrivateOrBlockedHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (!lower) return true;
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  // Block raw IPv4 private/loopback/link-local addresses
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return true;
    }
  }

  // Block IPv6 literals (loopback ::1, ULA fc00/fd00, link-local fe80)
  if (lower.includes(':') || lower.startsWith('[')) {
    return true;
  }

  return false;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, num: string) => {
      const code = Number(num);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html: string, keys: string[]): string {
  const metaTagRegex = /<meta\s+[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaTagRegex.exec(html)) !== null) {
    const tag = match[0];
    const attrMatch =
      /(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const attrName = (attrMatch?.[1] || attrMatch?.[2] || attrMatch?.[3] || '').toLowerCase();
    if (!attrName || !keys.includes(attrName)) continue;

    const contentMatch =
      /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const val = contentMatch?.[1] ?? contentMatch?.[2] ?? contentMatch?.[3] ?? '';
    if (val.trim()) {
      return decodeHtmlEntities(val).slice(0, 300);
    }
  }
  return '';
}

function extractTitleTag(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) return '';
  return decodeHtmlEntities(match[1]).slice(0, 200);
}

function resolvePreviewImageUrl(rawImage: string, baseUrl: string): string {
  if (!rawImage) return '';
  try {
    const resolved = new URL(rawImage, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return '';
    }
    if (isPrivateOrBlockedHostname(resolved.hostname)) {
      return '';
    }
    return resolved.toString();
  } catch {
    return '';
  }
}

function cachePreview(url: string, value: LinkPreviewResponse) {
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const firstKey = previewCache.keys().next().value;
    if (firstKey) previewCache.delete(firstKey);
  }
  previewCache.set(url, {
    value,
    expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
  });
}

export const linkPreviewRoutes = new Hono<AppEnv>();

linkPreviewRoutes.get('/', async (c) => {
  const rawUrl = (c.req.query('url') || '').trim();
  if (!rawUrl || rawUrl.length > 1024) {
    return c.json({ error: '无效的链接参数' }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return c.json({ error: '无效的 URL 格式' }, 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: '仅支持 http/https 链接预览' }, 400);
  }

  const host = parsed.hostname.replace(/^www\./i, '');
  const fallback: LinkPreviewResponse = {
    ok: true,
    resolved: false,
    url: rawUrl,
    host,
    title: host,
    description: '',
    imageUrl: '',
    siteName: host,
  };

  if (isPrivateOrBlockedHostname(parsed.hostname)) {
    return c.json(fallback);
  }

  const cached = previewCache.get(rawUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return c.json(cached.value);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    let res: Response;
    try {
      res = await fetch(rawUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'DevCommunityLinkPreviewBot/1.0',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    const finalUrlStr = res.url || rawUrl;
    const finalParsed = new URL(finalUrlStr);
    if (isPrivateOrBlockedHostname(finalParsed.hostname)) {
      return c.json(fallback);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || (!contentType.includes('text/html') && !contentType.includes('xhtml'))) {
      cachePreview(rawUrl, fallback);
      return c.json(fallback);
    }

    // Read at most 64KB of HTML to keep Worker fast and memory-safe
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let totalBytes = 0;
      while (totalBytes < 65_536) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          html += decoder.decode(value, { stream: true });
          if (html.includes('</head>')) break;
        }
      }
      reader.cancel().catch(() => {});
    } else {
      html = (await res.text()).slice(0, 65_536);
    }

    const title =
      extractMetaContent(html, ['og:title', 'twitter:title']) ||
      extractTitleTag(html) ||
      host;
    const description = extractMetaContent(html, [
      'og:description',
      'twitter:description',
      'description',
    ]);
    const rawImage = extractMetaContent(html, ['og:image', 'twitter:image']);
    const imageUrl = resolvePreviewImageUrl(rawImage, finalUrlStr);
    const siteName =
      extractMetaContent(html, ['og:site_name']) ||
      finalParsed.hostname.replace(/^www\./i, '') ||
      host;

    const payload: LinkPreviewResponse = {
      ok: true,
      resolved: Boolean(title || description || imageUrl),
      url: rawUrl,
      host,
      title,
      description,
      imageUrl,
      siteName,
    };
    cachePreview(rawUrl, payload);
    return c.json(payload);
  } catch {
    cachePreview(rawUrl, fallback);
    return c.json(fallback);
  }
});
