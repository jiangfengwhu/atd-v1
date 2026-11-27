import * as React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { api, type PublicUserProfile } from '@/lib/api';
import { AvatarBadge } from '@/components/AvatarBadge';
import { OfficialBadge } from '@/components/OfficialBadge';
import { cn } from '@/lib/utils';

interface HoverInitialUser {
  nickname: string;
  avatarSeed?: string;
  avatarUrl?: string;
  bio?: string;
  isOfficial?: boolean;
  officialBadge?: string;
  handle?: string;
}

interface UserHoverCardProps {
  userId: string;
  initialUser?: HoverInitialUser;
  onOpenProfile?: (userId: string) => void;
  children: React.ReactNode;
  className?: string;
}

const profileCache = new Map<string, PublicUserProfile>();
const activeCardClosers = new Map<symbol, () => void>();

export function UserHoverCard({
  userId,
  initialUser,
  onOpenProfile,
  children,
  className,
}: UserHoverCardProps) {
  const instanceKeyRef = React.useRef<symbol>(Symbol('UserHoverCard'));
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: 'bottom',
  });
  const [profile, setProfile] = React.useState<PublicUserProfile | null>(
    () => profileCache.get(userId) ?? null
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    const key = instanceKeyRef.current;
    activeCardClosers.set(key, () => {
      clearCloseTimer();
      setOpen(false);
    });
    return () => {
      clearCloseTimer();
      activeCardClosers.delete(key);
    };
  }, [clearCloseTimer]);

  const updatePosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cardWidth = 288;
    const estimatedHeight = 200;
    const margin = 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: 'top' | 'bottom' =
      spaceBelow >= estimatedHeight + margin || rect.top < estimatedHeight + margin
        ? 'bottom'
        : 'top';

    const top =
      placement === 'bottom'
        ? Math.min(window.innerHeight - estimatedHeight - margin, rect.bottom + margin)
        : Math.max(margin, rect.top - estimatedHeight - margin);

    const left = Math.max(
      margin,
      Math.min(window.innerWidth - cardWidth - margin, rect.left)
    );

    setCoords({ top, left, placement });
  }, []);

  const ensureProfileLoaded = React.useCallback(() => {
    if (!userId) return;
    const cached = profileCache.get(userId);
    if (cached) {
      setProfile(cached);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    api
      .getUserProfile(userId)
      .then((res) => {
        profileCache.set(userId, res.user);
        setProfile(res.user);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  const handleOpen = React.useCallback(() => {
    clearCloseTimer();
    const myKey = instanceKeyRef.current;
    for (const [key, closeFn] of activeCardClosers.entries()) {
      if (key !== myKey) {
        closeFn();
      }
    }
    updatePosition();
    setOpen(true);
    ensureProfileLoaded();
  }, [clearCloseTimer, ensureProfileLoaded, updatePosition]);

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 160);
  }, [clearCloseTimer]);

  const displayNickname = profile?.nickname ?? initialUser?.nickname ?? '社区用户';
  const displaySeed = profile?.avatarSeed ?? initialUser?.avatarSeed ?? userId;
  const displayAvatarUrl = profile?.avatarUrl ?? initialUser?.avatarUrl ?? '';
  const displayBio = profile?.bio ?? initialUser?.bio ?? '';
  const displayIsOfficial = profile?.isOfficial ?? initialUser?.isOfficial ?? false;
  const displayBadge = profile?.officialBadge ?? initialUser?.officialBadge;
  const displayHandle = profile?.handle ?? initialUser?.handle;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleOpen}
        onMouseLeave={scheduleClose}
        onFocus={handleOpen}
        onBlur={scheduleClose}
        className={cn('inline-flex items-center align-middle', className)}
      >
        {children}
      </span>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            data-testid="user-hover-card"
            data-user-id={userId}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 80,
            }}
            className="w-72 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl ring-1 ring-slate-900/5 animate-in fade-in-0 zoom-in-95 duration-150 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/10"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <AvatarBadge
                  nickname={displayNickname}
                  seed={displaySeed}
                  avatarUrl={displayAvatarUrl}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                      {displayNickname}
                    </span>
                    {displayIsOfficial && <OfficialBadge label={displayBadge} />}
                  </div>
                  <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                    @{displayHandle || displayNickname}
                  </p>
                </div>
              </div>

              {onOpenProfile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onOpenProfile(userId);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"
                >
                  <span>主页</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </button>
              )}
            </div>

            <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {displayBio || '这个人很低调，还没有填写个人简介 ✨'}
            </p>

            <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
              {loading && !profile ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  加载资料中...
                </span>
              ) : error && !profile ? (
                <span className="text-[11px] text-slate-400">暂无法获取统计数据</span>
              ) : profile ? (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {profile.postsCount}
                    </span>
                    <span className="text-[11px] text-slate-400">发帖</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {profile.followingCount}
                    </span>
                    <span className="text-[11px] text-slate-400">关注</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {profile.followersCount}
                    </span>
                    <span className="text-[11px] text-slate-400">粉丝</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
