import * as React from 'react';
import { ArrowUpRight, Globe, Link2 } from 'lucide-react';
import { buildUrlPreviewSummary } from '@/lib/urlParser';
import { cn } from '@/lib/utils';

interface LinkPreviewMeta {
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
  host: string;
  resolved: boolean;
}

const clientPreviewCache = new Map<string, LinkPreviewMeta>();
const inFlightRequests = new Map<string, Promise<LinkPreviewMeta | null>>();

function fetchLinkPreviewMeta(url: string): Promise<LinkPreviewMeta | null> {
  const cached = clientPreviewCache.get(url);
  if (cached) return Promise.resolve(cached);

  const existing = inFlightRequests.get(url);
  if (existing) return existing;

  const promise = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
    credentials: 'same-origin',
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        resolved?: boolean;
        title?: string;
        description?: string;
        imageUrl?: string;
        siteName?: string;
        host?: string;
      } | null;
      if (!data?.ok) return null;
      const meta: LinkPreviewMeta = {
        resolved: Boolean(data.resolved),
        title: typeof data.title === 'string' ? data.title : '',
        description: typeof data.description === 'string' ? data.description : '',
        imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
        siteName: typeof data.siteName === 'string' ? data.siteName : '',
        host: typeof data.host === 'string' ? data.host : '',
      };
      clientPreviewCache.set(url, meta);
      return meta;
    })
    .catch(() => null)
    .finally(() => {
      inFlightRequests.delete(url);
    });

  inFlightRequests.set(url, promise);
  return promise;
}

interface LinkPreviewProps {
  url: string;
  className?: string;
  compact?: boolean;
}

export function LinkPreview({ url, className, compact = false }: LinkPreviewProps) {
  const summary = React.useMemo(() => buildUrlPreviewSummary(url), [url]);
  const [remoteMeta, setRemoteMeta] = React.useState<LinkPreviewMeta | null>(
    () => clientPreviewCache.get(url) ?? null
  );
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
    const cached = clientPreviewCache.get(url);
    if (cached) {
      setRemoteMeta(cached);
      return;
    }
    setRemoteMeta(null);

    if (summary.isImage) return;

    let cancelled = false;
    fetchLinkPreviewMeta(url).then((meta) => {
      if (!cancelled && meta) {
        setRemoteMeta(meta);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, summary.isImage]);

  const coverImageUrl = !imgError
    ? summary.isImage
      ? url
      : remoteMeta?.imageUrl || ''
    : '';
  const displaySite =
    remoteMeta?.siteName &&
    remoteMeta.siteName.toLowerCase() !== summary.host.toLowerCase()
      ? `${remoteMeta.siteName} · ${summary.host}`
      : summary.host;
  const displayTitle =
    remoteMeta?.resolved && remoteMeta.title ? remoteMeta.title : summary.title;
  const displayDescription =
    remoteMeta?.resolved && remoteMeta.description
      ? remoteMeta.description
      : summary.subtitle;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      data-testid="link-preview-card"
      data-preview-url={url}
      className={cn(
        'group/link block w-full overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/75 text-left transition-all duration-150 hover:border-blue-300/90 hover:bg-blue-50/30 dark:border-slate-700/80 dark:bg-slate-800/60 dark:hover:border-blue-500/60 dark:hover:bg-slate-800',
        className
      )}
    >
      {coverImageUrl ? (
        <div className="flex flex-col">
          <div className="relative overflow-hidden border-b border-slate-200/70 bg-slate-100 dark:border-slate-700/70 dark:bg-slate-900">
            <img
              src={coverImageUrl}
              alt={displayTitle}
              loading="lazy"
              onError={() => setImgError(true)}
              className={cn(
                'w-full object-cover transition-transform duration-300 group-hover/link:scale-[1.01]',
                compact ? 'max-h-48' : 'max-h-60'
              )}
            />
            <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 rounded-full bg-slate-900/75 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              <Globe className="h-3 w-3 text-blue-300" />
              <span className="max-w-[280px] truncate">{displaySite}</span>
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="line-clamp-1 text-sm font-semibold text-slate-900 transition-colors group-hover/link:text-blue-600 dark:text-slate-100 dark:group-hover/link:text-blue-400">
                {displayTitle}
              </p>
              <p className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                {displayDescription}
              </p>
            </div>
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors group-hover/link:border-blue-200 group-hover/link:bg-blue-50 group-hover/link:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:group-hover/link:border-blue-500/40 dark:group-hover/link:bg-blue-950/60 dark:group-hover/link:text-blue-400">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-stretch">
          <div className="flex w-20 sm:w-24 shrink-0 flex-col items-center justify-center gap-1.5 border-r border-slate-200/80 bg-gradient-to-br from-blue-50 via-indigo-50/70 to-slate-100 px-2 py-3 text-blue-600 dark:border-slate-700/80 dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-900 dark:text-blue-400">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-blue-100 dark:bg-slate-900/90 dark:ring-slate-700">
              <Link2 className="h-4 w-4" />
            </span>
            <span className="max-w-full truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              链接
            </span>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-between gap-2.5 px-3.5 py-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <Globe className="h-3 w-3 shrink-0 text-blue-500 dark:text-blue-400" />
                <span className="truncate">{displaySite}</span>
              </div>
              <p className="line-clamp-1 text-sm font-semibold text-slate-900 transition-colors group-hover/link:text-blue-600 dark:text-slate-100 dark:group-hover/link:text-blue-400">
                {displayTitle}
              </p>
              <p className="line-clamp-1 break-all text-xs text-slate-500 dark:text-slate-400">
                {displayDescription}
              </p>
            </div>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors group-hover/link:border-blue-200 group-hover/link:bg-blue-50 group-hover/link:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:group-hover/link:border-blue-500/40 dark:group-hover/link:bg-blue-950/60 dark:group-hover/link:text-blue-400">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      )}
    </a>
  );
}
