import * as React from 'react';
import { Heart, MessageCircle, Trash2, Send, Loader2, Hash, CornerDownRight } from 'lucide-react';
import { api, ApiError, type CommentItem, type PostItem, type UserProfile } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AvatarBadge } from '@/components/AvatarBadge';
import { cn, formatRelativeTime } from '@/lib/utils';

interface PostDetailDialogProps {
  postId: string | null;
  currentUser: UserProfile | null;
  onClose: () => void;
  onRequireAuth: () => void;
  onPostUpdated: (post: PostItem) => void;
  onPostDeleted: (postId: string) => void;
  onOpenAuthor?: (userId: string) => void;
}

export function PostDetailDialog({
  postId,
  currentUser,
  onClose,
  onRequireAuth,
  onPostUpdated,
  onPostDeleted,
  onOpenAuthor,
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
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!postId) {
      setPost(null);
      setComments([]);
      setReplyTarget(null);
      setReplyText('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getPost(postId)
      .then((res) => {
        if (cancelled) return;
        setPost(res.post);
        setComments(res.comments);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : '加载帖子详情失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

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

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    const text = commentText.trim();
    if (!text) return;

    setSubmittingComment(true);
    setError(null);
    try {
      const res = await api.addComment(post.id, text);
      setComments((prev) => [...prev, { ...res.comment, replies: res.comment.replies ?? [] }]);
      const updated = { ...post, commentsCount: post.commentsCount + 1 };
      setPost(updated);
      onPostUpdated(updated);
      setCommentText('');
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
      setError(err instanceof ApiError ? err.message : '删除帖子失败');
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
            <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
          </div>
        ) : post ? (
          <div className="flex flex-col md:flex-row md:h-full">
            {/* Left Media / Editorial Cover Column */}
            <div className="md:w-[58%] md:h-full md:shrink-0">
              {post.imageUrl ? (
                <div className="flex min-h-[240px] max-h-[46vh] md:max-h-none md:h-full w-full items-center justify-center overflow-hidden bg-zinc-950">
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="max-h-[46vh] md:max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex min-h-[200px] md:h-full w-full flex-col justify-between bg-gradient-to-br from-rose-50 via-amber-50/80 to-indigo-50 p-6 sm:p-10 border-b md:border-b-0 md:border-r border-zinc-100">
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-rose-600 shadow-sm">
                    轻图文灵感笔记
                  </div>
                  <div className="my-6 space-y-3">
                    <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug tracking-tight text-zinc-900">
                      {post.title}
                    </h2>
                    <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                      {post.content}
                    </p>
                  </div>
                  {post.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-0.5 rounded-full bg-white/85 px-2.5 py-1 text-xs font-medium text-rose-600 shadow-sm"
                        >
                          <Hash className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-400">
                      {post.author.nickname} · {formatRelativeTime(post.createdAt)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right 3-Part Interaction Column */}
            <div className="flex flex-col bg-white min-w-0 md:w-[42%] md:h-full">
              {/* Fixed Top Author Header */}
              <div className="shrink-0 flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5 pr-12">
                <button
                  type="button"
                  onClick={() => navigateToUser(post.author.id)}
                  className="flex min-w-0 items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
                >
                  <AvatarBadge
                    nickname={post.author.nickname}
                    seed={post.author.avatarSeed}
                    avatarUrl={post.author.avatarUrl}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      {post.author.nickname}
                    </p>
                    <p className="text-xs text-zinc-400">{formatRelativeTime(post.createdAt)}</p>
                  </div>
                </button>

                {currentUser?.id === post.author.id && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                )}
              </div>

              {/* Independently Scrollable Body & Comments */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                <DialogHeader>
                  <DialogTitle className="text-lg leading-snug text-zinc-900">
                    {post.title}
                  </DialogTitle>
                </DialogHeader>

                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                  {post.content}
                </p>

                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600"
                      >
                        <Hash className="h-3 w-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {error && (
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
                )}

                <div className="border-t border-zinc-100 pt-4 space-y-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
                    <MessageCircle className="h-3.5 w-3.5 text-zinc-500" />
                    <span>评论 ({post.commentsCount})</span>
                  </div>

                  {comments.length === 0 ? (
                    <p className="py-6 text-center text-xs text-zinc-400">
                      还没有评论，来做第一个留言的人吧 ✨
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {comments.map((cm) => {
                        const replies = cm.replies ?? [];
                        const isReplyingHere = replyTarget?.commentId === cm.id;
                        return (
                          <li
                            key={cm.id}
                            className="rounded-2xl bg-zinc-50/80 p-3 text-sm space-y-2"
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
                                  <button
                                    type="button"
                                    onClick={() => navigateToUser(cm.author.id)}
                                    className="font-semibold text-zinc-800 hover:text-rose-600 transition-colors"
                                  >
                                    {cm.author.nickname}
                                  </button>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-zinc-400">
                                      {formatRelativeTime(cm.createdAt)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenReply(cm.id, cm.author.nickname, cm.author.id)
                                      }
                                      className="text-xs font-medium text-zinc-500 hover:text-rose-600 transition-colors"
                                    >
                                      回复
                                    </button>
                                  </div>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-zinc-600">{cm.content}</p>
                              </div>
                            </div>

                            {replies.length > 0 && (
                              <ul className="ml-8 space-y-2 border-l-2 border-zinc-200/80 pl-3">
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
                                            className="font-semibold text-zinc-800 hover:text-rose-600"
                                          >
                                            {rp.author.nickname}
                                          </button>
                                          {rp.replyToUser && (
                                            <span className="text-zinc-400">
                                              回复 @{rp.replyToUser.nickname}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] text-zinc-400">
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
                                            className="text-[11px] font-medium text-zinc-500 hover:text-rose-600"
                                          >
                                            回复
                                          </button>
                                        </div>
                                      </div>
                                      <p className="mt-0.5 whitespace-pre-wrap text-zinc-600">
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
                                <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
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

              {/* Fixed Bottom Like + Comment Input Bar */}
              <div className="shrink-0 border-t border-zinc-100 bg-white px-5 py-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={post.likedByMe ? 'gradient' : 'outline'}
                      onClick={handleToggleLike}
                      className="h-8 rounded-full gap-1.5 px-3"
                    >
                      <Heart className={cn('h-3.5 w-3.5', post.likedByMe && 'fill-current')} />
                      <span>{post.likesCount}</span>
                    </Button>
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {post.commentsCount} 条评论
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    {formatRelativeTime(post.createdAt)}
                  </span>
                </div>

                <form onSubmit={handleAddComment} className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={currentUser ? '说点什么吧，留下你的共鸣...' : '登录后即可发表评论'}
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
          <div className="p-8 text-center text-sm text-zinc-500">
            <DialogHeader className="sr-only">
              <DialogTitle>加载失败</DialogTitle>
            </DialogHeader>
            {error || '无法加载该图文内容'}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
