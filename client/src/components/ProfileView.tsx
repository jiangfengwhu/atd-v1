import * as React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Camera,
  Edit3,
  Loader2,
  MessageSquare,
  UserPlus,
  UserCheck,
  RefreshCw,
  FileText,
  Heart,
  MessageCircle,
  CornerDownRight,
  ArrowUpRight,
  ArrowDownLeft,
  Bookmark,
} from 'lucide-react';
import {
  api,
  ApiError,
  type CommentActivityItem,
  type FollowUserItem,
  type PostItem,
  type PublicUserProfile,
  type ReplyActivityItem,
  type ShareChannel,
  type UserProfile,
} from '@/lib/api';
import { AvatarBadge } from '@/components/AvatarBadge';
import { Button } from '@/components/ui/button';
import { OfficialBadge } from '@/components/OfficialBadge';
import { PostCard } from '@/components/PostCard';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatRelativeTime } from '@/lib/utils';

type ActivityTab = 'posts' | 'likes' | 'bookmarks' | 'comments' | 'replies';

interface ProfileViewProps {
  userId: string;
  currentUser: UserProfile | null;
  refreshKey?: number;
  shareSync?: { postId: string; sharesCount: number; seq: number } | null;
  onRequireAuth: () => void;
  onOpenEditProfile: () => void;
  onOpenPost: (postId: string) => void;
  onOpenUserProfile: (userId: string) => void;
  onStartMessage: (peerId: string) => void;
  onShareViaDm: (post: PostItem) => void;
  onPostShared?: (postId: string, sharesCount: number, channel?: ShareChannel) => void;
  onToast?: (message: string) => void;
  onCurrentUserUpdated: (user: UserProfile) => void;
}

export function ProfileView({
  userId,
  currentUser,
  refreshKey = 0,
  shareSync,
  onRequireAuth,
  onOpenEditProfile,
  onOpenPost,
  onOpenUserProfile,
  onStartMessage,
  onShareViaDm,
  onPostShared,
  onToast,
  onCurrentUserUpdated,
}: ProfileViewProps) {
  const [profile, setProfile] = React.useState<PublicUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  const [activeTab, setActiveTab] = React.useState<ActivityTab>('posts');
  const [tabLoading, setTabLoading] = React.useState(false);
  const [tabError, setTabError] = React.useState<string | null>(null);
  const [postsItems, setPostsItems] = React.useState<PostItem[]>([]);
  const [likesItems, setLikesItems] = React.useState<PostItem[]>([]);
  const [bookmarksItems, setBookmarksItems] = React.useState<PostItem[]>([]);
  const [commentsItems, setCommentsItems] = React.useState<CommentActivityItem[]>([]);
  const [repliesItems, setRepliesItems] = React.useState<ReplyActivityItem[]>([]);

  const [followPending, setFollowPending] = React.useState(false);
  const [followsModalType, setFollowsModalType] = React.useState<'following' | 'followers' | null>(
    null
  );
  const [followsList, setFollowsList] = React.useState<FollowUserItem[]>([]);
  const [followsLoading, setFollowsLoading] = React.useState(false);

  const [cropSrc, setCropSrc] = React.useState<string | null>(null);
  const [cropFileName, setCropFileName] = React.useState('avatar.png');
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);

  React.useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const loadProfile = React.useCallback(async () => {
    setLoadingProfile(true);
    setProfileError(null);
    try {
      const res = await api.getUserProfile(userId);
      setProfile(res.user);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : '加载个人主页失败');
    } finally {
      setLoadingProfile(false);
    }
  }, [userId]);

  const loadActivity = React.useCallback(
    async (tab: ActivityTab) => {
      setTabLoading(true);
      setTabError(null);
      try {
        const res = await api.getUserActivity(userId, tab);
        if (tab === 'posts') setPostsItems(res.items as PostItem[]);
        else if (tab === 'likes') setLikesItems(res.items as PostItem[]);
        else if (tab === 'bookmarks') setBookmarksItems(res.items as PostItem[]);
        else if (tab === 'comments') setCommentsItems(res.items as CommentActivityItem[]);
        else setRepliesItems(res.items as ReplyActivityItem[]);
      } catch (err) {
        setTabError(err instanceof ApiError ? err.message : '加载动态记录失败');
      } finally {
        setTabLoading(false);
      }
    },
    [userId]
  );

  React.useEffect(() => {
    setActiveTab('posts');
    loadProfile();
  }, [loadProfile, refreshKey]);

  React.useEffect(() => {
    loadActivity(activeTab);
  }, [activeTab, loadActivity, refreshKey]);

  const handleToggleFollow = async () => {
    if (!profile) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setFollowPending(true);
    try {
      const res = await api.toggleFollow(profile.id);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: res.following,
              followersCount: res.followersCount,
            }
          : prev
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onRequireAuth();
      }
    } finally {
      setFollowPending(false);
    }
  };

  const handleOpenFollows = async (type: 'following' | 'followers') => {
    if (!profile) return;
    setFollowsModalType(type);
    setFollowsLoading(true);
    try {
      const res = await api.getFollows(profile.id, type);
      setFollowsList(res.users);
    } catch {
      setFollowsList([]);
    } finally {
      setFollowsLoading(false);
    }
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropFileName(file.name || 'avatar.png');
    setCropSrc(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleAvatarCropped = async (croppedFile: File) => {
    if (!profile) return;
    setUploadingAvatar(true);
    try {
      const uploaded = await api.uploadImage(croppedFile);
      const updated = await api.updateProfile({ avatarUrl: uploaded.url });
      setProfile((prev) => (prev ? { ...prev, avatarUrl: updated.user.avatarUrl ?? '' } : prev));
      onCurrentUserUpdated(updated.user);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : '头像更新失败');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleTogglePostLike = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    try {
      const res = await api.toggleLike(postId);
      const updateList = (list: PostItem[]) =>
        list.map((p) =>
          p.id === postId ? { ...p, likedByMe: res.liked, likesCount: res.likesCount } : p
        );
      setPostsItems(updateList);
      setLikesItems(updateList);
      setBookmarksItems(updateList);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onRequireAuth();
      }
    }
  };

  const handleTogglePostBookmark = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    try {
      const res = await api.toggleBookmark(postId);
      const updateList = (list: PostItem[]) =>
        list.map((p) =>
          p.id === postId
            ? { ...p, bookmarkedByMe: res.bookmarked, bookmarksCount: res.bookmarksCount }
            : p
        );
      setPostsItems(updateList);
      setLikesItems(updateList);
      if (!res.bookmarked && profile?.isSelf) {
        setBookmarksItems((prev) => prev.filter((p) => p.id !== postId));
      } else {
        setBookmarksItems(updateList);
      }
      setProfile((prev) =>
        prev && prev.isSelf
          ? {
              ...prev,
              bookmarksCount: Math.max(
                0,
                (prev.bookmarksCount ?? 0) + (res.bookmarked ? 1 : -1)
              ),
            }
          : prev
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onRequireAuth();
      }
    }
  };

  React.useEffect(() => {
    if (!shareSync) return;
    const updateList = (list: PostItem[]) =>
      list.map((p) =>
        p.id === shareSync.postId ? { ...p, sharesCount: shareSync.sharesCount } : p
      );
    setPostsItems(updateList);
    setLikesItems(updateList);
    setBookmarksItems(updateList);
  }, [shareSync]);

  const handlePostSharedLocal = (postId: string, sharesCount: number, channel?: ShareChannel) => {
    const updateList = (list: PostItem[]) =>
      list.map((p) => (p.id === postId ? { ...p, sharesCount } : p));
    setPostsItems(updateList);
    setLikesItems(updateList);
    setBookmarksItems(updateList);
    onPostShared?.(postId, sharesCount, channel);
  };

  if (loadingProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-zinc-200/75 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-5">
            <div className="h-20 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-slate-800" />
            <div className="space-y-2.5 flex-1">
              <div className="h-6 w-40 animate-pulse rounded bg-zinc-200 dark:bg-slate-800" />
              <div className="h-4 w-72 animate-pulse rounded bg-zinc-100 dark:bg-slate-800/70" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-red-100 bg-white py-16 px-6 text-center shadow-card dark:border-red-900/60 dark:bg-slate-900">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{profileError || '用户不存在'}</p>
        <Button variant="outline" size="sm" onClick={loadProfile} className="mt-4">
          <RefreshCw className="h-3.5 w-3.5" />
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Header Card */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900/90">
        <div className="h-24 bg-gradient-to-r from-slate-100 via-blue-50 to-slate-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative group">
                <AvatarBadge
                  nickname={profile.nickname}
                  seed={profile.avatarSeed}
                  avatarUrl={profile.avatarUrl}
                  size="xl"
                  className="ring-4 ring-white dark:ring-slate-900"
                />
                {profile.isSelf && (
                  <label
                    title="更换头像"
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleAvatarFileSelect}
                      disabled={uploadingAvatar}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>

              <div className="pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 sm:text-2xl dark:text-slate-100">
                    {profile.nickname}
                  </h1>
                  {profile.isOfficial && (
                    <OfficialBadge label={profile.officialBadge} size="lg" />
                  )}
                </div>
                {profile.isSelf && profile.email && (
                  <p className="text-xs text-zinc-400 dark:text-slate-500">{profile.email}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {profile.isSelf ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenEditProfile}
                  className="h-9 px-4"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  编辑资料
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant={profile.isFollowing ? 'outline' : 'gradient'}
                    size="sm"
                    onClick={handleToggleFollow}
                    disabled={followPending}
                    className="h-9 px-4"
                  >
                    {profile.isFollowing ? (
                      <>
                        <UserCheck className="h-3.5 w-3.5" />
                        已关注
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" />
                        关注
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!currentUser) {
                        onRequireAuth();
                        return;
                      }
                      onStartMessage(profile.id);
                    }}
                    className="h-9 px-4"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    发私信
                  </Button>
                </>
              )}
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-slate-300">
            {profile.bio || '这个人很低调，还没有填写个人简介 ✨'}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-zinc-100 pt-4 text-sm dark:border-slate-800">
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-zinc-900 tabular-nums dark:text-slate-100">{profile.postsCount}</span>
              <span className="text-xs text-zinc-500 dark:text-slate-400">发帖</span>
            </div>
            <button
              type="button"
              onClick={() => handleOpenFollows('following')}
              className="flex items-baseline gap-1.5 hover:text-blue-600 transition-colors dark:hover:text-blue-400"
            >
              <span className="font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {profile.followingCount}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">关注</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenFollows('followers')}
              className="flex items-baseline gap-1.5 hover:text-blue-600 transition-colors dark:hover:text-blue-400"
            >
              <span className="font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {profile.followersCount}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">粉丝</span>
            </button>
          </div>
        </div>
      </section>

      {/* Activity Tabs */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ActivityTab)}
        className="space-y-4"
      >
        <Tabs.List className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {[
            { value: 'posts' as const, label: '历史发帖', count: profile.postsCount, icon: FileText },
            { value: 'likes' as const, label: '点赞', count: profile.likesCount, icon: Heart },
            ...(profile.isSelf
              ? [
                  {
                    value: 'bookmarks' as const,
                    label: '收藏',
                    count: profile.bookmarksCount ?? 0,
                    icon: Bookmark,
                  },
                ]
              : []),
            {
              value: 'comments' as const,
              label: '评论',
              count: profile.commentsCount,
              icon: MessageCircle,
            },
            {
              value: 'replies' as const,
              label: '回复',
              count: profile.repliesCount,
              icon: CornerDownRight,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <Tabs.Trigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition',
                  'data-[state=active]:bg-zinc-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-600',
                  'data-[state=inactive]:text-zinc-600 data-[state=inactive]:hover:bg-zinc-100 dark:data-[state=inactive]:text-slate-400 dark:data-[state=inactive]:hover:bg-slate-800'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span className="opacity-70 tabular-nums">({tab.count})</span>
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {tabLoading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : tabError ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-red-100 bg-white py-12 text-center dark:border-red-900/60 dark:bg-slate-900">
            <p className="text-sm text-red-600 dark:text-red-400">{tabError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadActivity(activeTab)}
              className="mt-3"
            >
              重试
            </Button>
          </div>
        ) : (
          <>
            <Tabs.Content value="posts">
              {postsItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-300/80 bg-white/70 py-14 text-center text-sm text-zinc-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500">
                  还没有发布过图文动态
                </div>
              ) : (
                <div className="space-y-4">
                  {postsItems.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onOpen={onOpenPost}
                      onToggleLike={handleTogglePostLike}
                      onToggleBookmark={handleTogglePostBookmark}
                      onShareViaDm={onShareViaDm}
                      onPostShared={handlePostSharedLocal}
                      onToast={onToast}
                      onOpenAuthor={onOpenUserProfile}
                    />
                  ))}
                </div>
              )}
            </Tabs.Content>

            <Tabs.Content value="likes">
              {likesItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-300/80 bg-white/70 py-14 text-center text-sm text-zinc-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500">
                  还没有点赞过图文
                </div>
              ) : (
                <div className="space-y-4">
                  {likesItems.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onOpen={onOpenPost}
                      onToggleLike={handleTogglePostLike}
                      onToggleBookmark={handleTogglePostBookmark}
                      onShareViaDm={onShareViaDm}
                      onPostShared={handlePostSharedLocal}
                      onToast={onToast}
                      onOpenAuthor={onOpenUserProfile}
                    />
                  ))}
                </div>
              )}
            </Tabs.Content>

            {profile.isSelf && (
              <Tabs.Content value="bookmarks">
                {bookmarksItems.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-zinc-300/80 bg-white/70 py-14 text-center text-sm text-zinc-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500">
                    还没有收藏过动态，去动态列表点击收藏吧
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bookmarksItems.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onOpen={onOpenPost}
                        onToggleLike={handleTogglePostLike}
                        onToggleBookmark={handleTogglePostBookmark}
                        onShareViaDm={onShareViaDm}
                        onPostShared={handlePostSharedLocal}
                        onToast={onToast}
                        onOpenAuthor={onOpenUserProfile}
                      />
                    ))}
                  </div>
                )}
              </Tabs.Content>
            )}

            <Tabs.Content value="comments">
              {commentsItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-300/80 bg-white/70 py-14 text-center text-sm text-zinc-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500">
                  还没有发表过评论
                </div>
              ) : (
                <ul className="space-y-3">
                  {commentsItems.map((item) => (
                    <li
                      key={item.id}
                      onClick={() => onOpenPost(item.postId)}
                      className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-card dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-blue-800"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
                        <span className="font-medium text-slate-600 truncate dark:text-slate-300">
                          评论了动态：{item.postContentPreview}
                        </span>
                        <span className="shrink-0">{formatRelativeTime(item.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap dark:text-slate-200">
                        {item.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Tabs.Content>

            <Tabs.Content value="replies">
              {repliesItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300/80 bg-white/70 py-14 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500">
                  还没有回复记录
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {repliesItems.map((item) => (
                    <li
                      key={item.id}
                      onClick={() => onOpenPost(item.postId)}
                      className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-card dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-blue-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                              item.direction === 'sent'
                                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                            )}
                          >
                            {item.direction === 'sent' ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownLeft className="h-3 w-3" />
                            )}
                            {item.direction === 'sent' ? '发出回复' : '收到回复'}
                          </span>
                          <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                            {item.author.nickname}
                            {item.replyToUser ? ` 回复 @${item.replyToUser.nickname}` : ''}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap dark:text-slate-200">
                        {item.content}
                      </p>

                      <div className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                        <span className="line-clamp-1">原评论：{item.parentCommentContent}</span>
                        <span className="mt-0.5 block font-medium text-slate-600 truncate dark:text-slate-300">
                          来源动态：{item.postContentPreview}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Tabs.Content>
          </>
        )}
      </Tabs.Root>

      {/* Following / Followers Modal */}
      <Dialog open={Boolean(followsModalType)} onOpenChange={(v) => !v && setFollowsModalType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{followsModalType === 'following' ? '关注列表' : '粉丝列表'}</DialogTitle>
            <DialogDescription>{profile.nickname} 的社交关系</DialogDescription>
          </DialogHeader>

          {followsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-rose-500" />
            </div>
          ) : followsList.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-400 dark:text-slate-500">
              {followsModalType === 'following' ? '还没有关注任何人' : '还没有粉丝'}
            </p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {followsList.map((u) => (
                <li
                  key={u.id}
                  onClick={() => {
                    setFollowsModalType(null);
                    onOpenUserProfile(u.id);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/70 p-3 transition hover:bg-zinc-100/80 dark:border-slate-800 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarBadge
                      nickname={u.nickname}
                      seed={u.avatarSeed}
                      avatarUrl={u.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-slate-100">{u.nickname}</p>
                      <p className="truncate text-xs text-zinc-400 dark:text-slate-500">
                        {u.bio || '暂无个人简介'}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        mode="avatar"
        fileName={cropFileName}
        onClose={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        onConfirm={handleAvatarCropped}
      />
    </div>
  );
}
