import * as React from 'react';
import {
  Heart,
  MessageCircle,
  Trash2,
  Send,
  Loader2,
  Hash,
  CornerDownRight,
  Bookmark,
  Eye,
} from 'lucide-react';
import {
  api,
  ApiError,
  type CommentItem,
  type FeedbackTicketStatus,
  type PostItem,
  type ShareChannel,
  type UserProfile,
} from '@/lib/api';
import { extractHashtagsFromContent } from '@/lib/hashtags';
import { getPrimaryPreviewUrl } from '@/lib/urlParser';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AvatarBadge } from '@/components/AvatarBadge';
import { HashtagText } from '@/components/HashtagText';
import { LinkPreview } from '@/components/LinkPreview';
import { OfficialBadge } from '@/components/OfficialBadge';
import { SharePostMenu } from '@/components/SharePostMenu';
import { TICKET_STATUS_META, TicketStatusBadge } from '@/components/TicketStatusBadge';
import { cn, formatRelativeTime } from '@/lib/utils';

interface PostDetailDialogProps {
  postId: string | null;
  currentUser: UserProfile | null;
  shareSync?: { postId: string; sharesCount: number; seq: number } | null;
  onClose: () => void;
  onRequireAuth: () => void;
  onPostUpdated: (post: PostItem) => void;
  onPostDeleted: (postId: string) => void;
  onShareViaDm?: (post: PostItem) => void;
  onPostShared?: (postId: string, sharesCount: number, channel?: ShareChannel) => void;
  onToast?: (message: string) => void;
  onOpenAuthor?: (userId: string) => void;
  onSelectTag?: (tag: string) => void;
}

export function PostDetailDialog({
  postId,
  currentUser,
  shareSync,
  onClose,
  onRequireAuth,
  onPostUpdated,
  onPostDeleted,
  onShareViaDm,
  onPostShared,
  onToast,
  onOpenAuthor,
  onSelectTag,
}: PostDetailDialogProps) {
  const [post, setPost] = React.useState<PostItem | null>(null);
  const [comments, setComments] = React.useState<CommentItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [commentText, setCommentText] = React.useState('');
  const [submittingComment, setSubmittingComment] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<{
    commentId: string;
    replyToUserId?: string;
    replyToNickname: string;
  } | null>(null);
  const [replyText, setReplyText] = React.useState('');
  const [submittingReply, setSubmittingReply] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [selectedTicketStatus, setSelectedTicketStatus] = React.useState<
    '' | FeedbackTicketStatus
  >('');
  const [error, setError] = React.useState<string | null>(null);
  const onPostUpdatedRef = React.useRef(onPostUpdated);
  onPostUpdatedRef.current = onPostUpdated;

  React.useEffect(() => {
    if (!postId) {
      setPost(null);
      setComments([]);
      setReplyTarget(null);
      setReplyText('');
      setIsAdmin(false);
      setSelectedTicketStatus('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedTicketStatus('');

    api
      .adminMe()
      .then((res) => {
        if (!cancelled) setIsAdmin(Boolean(res.authenticated));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });

    api
      .getPost(postId)
      .then((res) => {
        if (cancelled) return;
        setPost(res.post);
        setComments(res.comments);

        api
          .recordPostView(postId)
          .then((viewRes) => {
            if (cancelled) return;
            const nextPost = { ...res.post, viewsCount: viewRes.viewsCount };
            setPost((prev) =>
              prev && prev.id === postId ? { ...prev, viewsCount: viewRes.viewsCount } : prev
            );
            onPostUpdatedRef.current(nextPost);
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : '动态不存在或无法加载');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  React.useEffect(() => {
    if (!shareSync) return;
    setPost((prev) =>
      prev && prev.id === shareSync.postId
        ? { ...prev, sharesCount: shareSync.sharesCount }
        : prev
    );
  }, [shareSync]);

  const fallbackTags = React.useMemo(() => {
    if (!post || !post.tags || post.tags.length === 0) return [];
    const inlineSet = new Set(extractHashtagsFromContent(post.content));
    return post.tags.filter((t) => !inlineSet.has(t));
  }, [post]);

  const primaryPreviewUrl = React.useMemo(() => {
    if (!post || post.imageUrl) return null;
    return getPrimaryPreviewUrl(post.content);
  }, [post]);

  const handleTagClick = (tag: string) => {
    if (onSelectTag) {
      onClose();
      onSelectTag(tag);
    }
  };

  const handleToggleLike = async () => {
    if (!post) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    try {
      const res = await api.toggleLike(post.id);
      const updated = { ...post, likedByMe: res.liked, likesCount: res.likesCount };
      setPost(updated);
      onPostUpdated(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onRequireAuth();
      }
    }
  };

  const handleToggleBookmark = async () => {
    if (!post) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    try {
      const res = await api.toggleBookmark(post.id);
      const updated = {
        ...post,
        bookmarkedByMe: res.bookmarked,
        bookmarksCount: res.bookmarksCount,
      };
      setPost(updated);
      onPostUpdated(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onRequireAuth();
      }
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;
    const canAdminUpdate = Boolean(isAdmin && post.feedbackTicket && selectedTicketStatus);
    if (!currentUser && !canAdminUpdate) {
      onRequireAuth();
      return;
    }
    const text = commentText.trim();
    if (!text) return;

    setSubmittingComment(true);
    setError(null);
    try {
      const res = await api.addComment(
        post.id,
        text,
        canAdminUpdate && selectedTicketStatus
          ? { ticketStatus: selectedTicketStatus }
          : undefined
      );
      setComments((prev) => [...prev, { ...res.comment, replies: res.comment.replies ?? [] }]);
      const updated = {
        ...post,
        commentsCount: post.commentsCount + 1,
        ...(res.feedbackTicket ? { feedbackTicket: res.feedbackTicket } : {}),
      };
      setPost(updated);
      onPostUpdated(updated);
      setCommentText('');
      setSelectedTicketStatus('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发表评论失败');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleOpenReply = (
    commentId: string,
    replyToNickname: string,
    replyToUserId?: string
  ) => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setReplyTarget({ commentId, replyToNickname, replyToUserId });
    setReplyText('');
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !replyTarget) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    const text = replyText.trim();
    if (!text) return;

    setSubmittingReply(true);
    setError(null);
    try {
      const res = await api.addReply(
        post.id,
        replyTarget.commentId,
        text,
        replyTarget.replyToUserId
      );
      setComments((prev) =>
        prev.map((cm) =>
          cm.id === replyTarget.commentId
            ? { ...cm, replies: [...(cm.replies ?? []), res.reply] }
            : cm
        )
      );
      const updated = { ...post, commentsCount: post.commentsCount + 1 };
      setPost(updated);
      onPostUpdated(updated);
      setReplyTarget(null);
      setReplyText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发表回复失败');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDelete = async () => {
    if (!post || !currentUser || currentUser.id !== post.author.id) return;
    setDeleting(true);
    try {
      await api.deletePost(post.id);
      onPostDeleted(post.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除动态失败');
    } finally {
      setDeleting(false);
    }
  };

  const navigateToUser = (userId: string) => {
    if (onOpenAuthor) {
      onClose();
      onOpenAuthor(userId);
    }
  };

  return (
    <Dialog open={Boolean(postId)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl w-[calc(100vw-2rem)] p-0 max-h-[90vh] overflow-y-auto md:overflow-hidden md:h-[min(86vh,760px)]">
        {loading ? (
          <div className="flex h-72 md:h-full items-center justify-center">
            <DialogHeader className="sr-only">
              <DialogTitle>加载动态详情</DialogTitle>
            </DialogHeader>
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : post ? (
          <div className="flex flex-col md:flex-row md:h-full">
            {/* Left Media / Clean Text Card */}
            <div className="md:w-[58%] md:h-full md:shrink-0">
              {post.imageUrl ? (
                <div className="flex min-h-[240px] max-h-[46vh] md:max-h-none md:h-full w-full items-center justify-center overflow-hidden bg-slate-950">
                  <img
                    src={post.imageUrl}
                    alt={post.content.slice(0, 40) || '动态配图'}
                    className="max-h-[46vh] md:max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex min-h-[200px] md:h-full w-full flex-col justify-between overflow-y-auto bg-slate-50 p-6 sm:p-10 border-b md:border-b-0 md:border-r border-slate-200/80 dark:bg-slate-950/80 dark:border-slate-800">
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    dev社区 · 动态详情
                  </div>
                  <div className="my-6 space-y-4">
                    <p className="whitespace-pre-wrap text-base sm:text-lg leading-relaxed text-slate-800 dark:text-slate-100">
                      <HashtagText
                        content={post.content}
                        mentions={post.mentions}
                        onSelectTag={(tag) => handleTagClick(tag)}
                        onSelectMention={(mention) => navigateToUser(mention.userId)}
                      />
                    </p>
                    {primaryPreviewUrl && <LinkPreview url={primaryPreviewUrl} />}
                  </div>
                  {post.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleTagClick(tag)}
                          className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-slate-800"
                        >
                          <Hash className="h-3 w-3" />
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {post.author.nickname} · {formatRelativeTime(post.createdAt)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right 3-Part Interaction Column */}
            <div className="flex flex-col bg-white min-w-0 md:w-[42%] md:h-full dark:bg-slate-900">
              {/* Fixed Top Author Header */}
              <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 pr-12 dark:border-slate-800">
                <DialogHeader className="sr-only">
                  <DialogTitle>{post.author.nickname} 的动态</DialogTitle>
                </DialogHeader>
                <button
                  type="button"
                  onClick={() => navigateToUser(post.author.id)}
                  className="flex min-w-0 items-center gap-2.5 text-left transition-opacity hover:opacity-80"
                >
                  <AvatarBadge
                    nickname={post.author.nickname}
                    seed={post.author.avatarSeed}
                    avatarUrl={post.author.avatarUrl}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {post.author.nickname}
                      </p>
                      {post.author.isOfficial && (
                        <OfficialBadge label={post.author.officialBadge} />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{formatRelativeTime(post.createdAt)}</p>
                  </div>
                </button>

                {currentUser?.id === post.author.id && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-950/60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                )}
              </div>

              {/* Independently Scrollable Body & Comments */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                {post.feedbackTicket && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2 dark:border-slate-700/80 dark:bg-slate-800/70">
                    <TicketStatusBadge status={post.feedbackTicket.status} />
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      工单编号 {post.feedbackTicket.id.slice(0, 12)}
                    </span>
                  </div>
                )}

                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                  <HashtagText
                    content={post.content}
                    mentions={post.mentions}
                    onSelectTag={(tag) => handleTagClick(tag)}
                    onSelectMention={(mention) => navigateToUser(mention.userId)}
                  />
                </p>

                {fallbackTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {fallbackTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleTagClick(tag)}
                        className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700"
                      >
                        <Hash className="h-3 w-3" />
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {error && (
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/60 dark:text-red-400">{error}</div>
                )}

                <div className="border-t border-slate-100 pt-4 space-y-3.5 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <MessageCircle className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    <span>评论 ({post.commentsCount})</span>
                  </div>

                  {comments.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                      还没有评论，来做第一个留言的人吧
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {comments.map((cm) => {
                        const replies = cm.replies ?? [];
                        const isReplyingHere = replyTarget?.commentId === cm.id;
                        return (
                          <li
                            key={cm.id}
                            className="rounded-2xl bg-slate-50/90 p-3 text-sm space-y-2 dark:bg-slate-800/60"
                          >
                            <div className="flex gap-2.5">
                              <button
                                type="button"
                                onClick={() => navigateToUser(cm.author.id)}
                                className="shrink-0 mt-0.5"
                              >
                                <AvatarBadge
                                  nickname={cm.author.nickname}
                                  seed={cm.author.avatarSeed}
                                  avatarUrl={cm.author.avatarUrl}
                                  size="sm"
                                />
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => navigateToUser(cm.author.id)}
                                      className="truncate font-semibold text-slate-800 hover:text-blue-600 transition-colors dark:text-slate-100 dark:hover:text-blue-400"
                                    >
                                      {cm.author.nickname}
                                    </button>
                                    {cm.author.isOfficial && (
                                      <OfficialBadge label={cm.author.officialBadge} />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                      {formatRelativeTime(cm.createdAt)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenReply(cm.id, cm.author.nickname, cm.author.id)
                                      }
                                      className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors dark:text-slate-400 dark:hover:text-blue-400"
                                    >
                                      回复
                                    </button>
                                  </div>
                                </div>
                                {cm.ticketEvent && (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    <TicketStatusBadge
                                      status={cm.ticketEvent.toStatus}
                                      prefix="工单状态："
                                      testId="comment-ticket-status"
                                    />
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                      ({cm.ticketEvent.fromStatusLabel} →{' '}
                                      {cm.ticketEvent.toStatusLabel})
                                    </span>
                                  </div>
                                )}
                                <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{cm.content}</p>
                              </div>
                            </div>

                            {replies.length > 0 && (
                              <ul className="ml-8 space-y-2 border-l-2 border-slate-200/80 pl-3 dark:border-slate-700">
                                {replies.map((rp) => (
                                  <li key={rp.id} className="flex gap-2 text-xs">
                                    <button
                                      type="button"
                                      onClick={() => navigateToUser(rp.author.id)}
                                      className="shrink-0 mt-0.5"
                                    >
                                      <AvatarBadge
                                        nickname={rp.author.nickname}
                                        seed={rp.author.avatarSeed}
                                        avatarUrl={rp.author.avatarUrl}
                                        size="sm"
                                      />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => navigateToUser(rp.author.id)}
                                            className="font-semibold text-slate-800 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
                                          >
                                            {rp.author.nickname}
                                          </button>
                                          {rp.replyToUser && (
                                            <span className="text-slate-400 dark:text-slate-500">
                                              回复 @{rp.replyToUser.nickname}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                            {formatRelativeTime(rp.createdAt)}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleOpenReply(
                                                cm.id,
                                                rp.author.nickname,
                                                rp.author.id
                                              )
                                            }
                                            className="text-[11px] font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                                          >
                                            回复
                                          </button>
                                        </div>
                                      </div>
                                      <p className="mt-0.5 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                                        {rp.content}
                                      </p>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}

                            {isReplyingHere && (
                              <form
                                onSubmit={handleSubmitReply}
                                className="ml-8 flex items-center gap-2 pt-1"
                              >
                                <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                <Input
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder={`回复 @${replyTarget.replyToNickname}...`}
                                  maxLength={1000}
                                  className="h-8 text-xs"
                                  autoFocus
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={submittingReply || !replyText.trim()}
                                  className="h-8 rounded-xl px-3 text-xs"
                                >
                                  {submittingReply ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    '发送'
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setReplyTarget(null)}
                                  className="h-8 px-2 text-xs"
                                >
                                  取消
                                </Button>
                              </form>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Fixed Bottom Like + Bookmark + Share + Comment Input Bar */}
              <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3.5 space-y-2.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleToggleLike}
                      aria-label="点赞"
                      className={cn(
                        'h-8 rounded-full gap-1 px-2.5 text-xs',
                        post.likedByMe && 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-400 dark:hover:bg-rose-950'
                      )}
                    >
                      <Heart className={cn('h-3.5 w-3.5', post.likedByMe && 'fill-current')} />
                      <span>{post.likesCount}</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={post.bookmarkedByMe ? 'default' : 'outline'}
                      onClick={handleToggleBookmark}
                      aria-label={post.bookmarkedByMe ? '取消收藏' : '收藏'}
                      className={cn(
                        'h-8 rounded-full gap-1 px-2.5 text-xs',
                        post.bookmarkedByMe && 'bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:text-white dark:hover:bg-amber-500'
                      )}
                    >
                      <Bookmark
                        className={cn('h-3.5 w-3.5', post.bookmarkedByMe && 'fill-current')}
                      />
                      <span>{post.bookmarksCount ?? 0}</span>
                    </Button>
                    <SharePostMenu
                      post={post}
                      placement="up"
                      align="left"
                      triggerVariant="detail"
                      onShareViaDm={(targetPost) => onShareViaDm?.(targetPost)}
                      onShareSuccess={(sharedPostId, sharesCount, channel) => {
                        const updated = { ...post, sharesCount };
                        setPost(updated);
                        onPostUpdated(updated);
                        onPostShared?.(sharedPostId, sharesCount, channel);
                      }}
                      onToast={onToast}
                    />
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                    <Eye className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{post.viewsCount ?? 0}</span>
                  </span>
                </div>

                {isAdmin && post.feedbackTicket && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200/80 bg-blue-50/50 px-2.5 py-1.5 dark:border-blue-800/70 dark:bg-blue-950/40">
                    <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                      管理员工单联动：
                    </span>
                    <select
                      aria-label="变更工单状态"
                      data-testid="admin-ticket-status-select"
                      value={selectedTicketStatus}
                      onChange={(e) =>
                        setSelectedTicketStatus(e.target.value as '' | FeedbackTicketStatus)
                      }
                      className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="">仅回复（不变更状态）</option>
                      {(['confirmed', 'in_progress', 'launched', 'closed'] as const).map((st) => (
                        <option key={st} value={st}>
                          更新为：{TICKET_STATUS_META[st].label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <form onSubmit={handleAddComment} className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={
                      currentUser || (isAdmin && post.feedbackTicket && selectedTicketStatus)
                        ? '写下你的评论或补充建议...'
                        : '登录后即可发表评论'
                    }
                    maxLength={1000}
                    className="h-9 rounded-full"
                  />
                  <Button
                    type="submit"
                    disabled={submittingComment || !commentText.trim()}
                    className="h-9 shrink-0 rounded-full px-4"
                  >
                    {submittingComment ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    发送
                  </Button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-10 text-center space-y-4">
            <DialogHeader className="sr-only">
              <DialogTitle>加载失败</DialogTitle>
            </DialogHeader>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {error || '该动态不存在或已被删除'}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              返回首页
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
