import * as React from 'react';
import { Heart, MessageCircle, Trash2, Send, Loader2, Hash } from 'lucide-react';
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
}

export function PostDetailDialog({
  postId,
  currentUser,
  onClose,
  onRequireAuth,
  onPostUpdated,
  onPostDeleted,
}: PostDetailDialogProps) {
  const [post, setPost] = React.useState<PostItem | null>(null);
  const [comments, setComments] = React.useState<CommentItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [commentText, setCommentText] = React.useState('');
  const [submittingComment, setSubmittingComment] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!postId) {
      setPost(null);
      setComments([]);
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
      setComments((prev) => [...prev, res.comment]);
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

  return (
    <Dialog open={Boolean(postId)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
          </div>
        ) : post ? (
          <div className="max-h-[88vh] overflow-y-auto">
            {post.imageUrl && (
              <div className="bg-zinc-950/5">
                <img
                  src={post.imageUrl}
                  alt={post.title}
                  className="max-h-[420px] w-full object-contain bg-zinc-900/5"
                />
              </div>
            )}

            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AvatarBadge
                    nickname={post.author.nickname}
                    seed={post.author.avatarSeed}
                    size="md"
                  />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{post.author.nickname}</p>
                    <p className="text-xs text-zinc-400">{formatRelativeTime(post.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pr-8">
                  <Button
                    type="button"
                    size="sm"
                    variant={post.likedByMe ? 'gradient' : 'outline'}
                    onClick={handleToggleLike}
                    className="gap-1.5"
                  >
                    <Heart className={cn('h-3.5 w-3.5', post.likedByMe && 'fill-current')} />
                    <span>{post.likesCount}</span>
                  </Button>

                  {currentUser?.id === post.author.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  )}
                </div>
              </div>

              <DialogHeader>
                <DialogTitle className="text-xl leading-snug text-zinc-900">
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

              <div className="border-t border-zinc-100 pt-5 space-y-4">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
                  <MessageCircle className="h-4 w-4 text-zinc-500" />
                  <span>评论 ({comments.length})</span>
                </div>

                <form onSubmit={handleAddComment} className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={currentUser ? '说点什么吧，留下你的共鸣...' : '登录后即可发表评论'}
                    maxLength={1000}
                  />
                  <Button
                    type="submit"
                    disabled={submittingComment || !commentText.trim()}
                    className="shrink-0 rounded-xl"
                  >
                    {submittingComment ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    发送
                  </Button>
                </form>

                {comments.length === 0 ? (
                  <p className="py-4 text-center text-xs text-zinc-400">
                    还没有评论，来做第一个留言的人吧 ✨
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {comments.map((cm) => (
                      <li
                        key={cm.id}
                        className="flex gap-2.5 rounded-2xl bg-zinc-50/80 p-3 text-sm"
                      >
                        <AvatarBadge
                          nickname={cm.author.nickname}
                          seed={cm.author.avatarSeed}
                          size="sm"
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-zinc-800">
                              {cm.author.nickname}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              {formatRelativeTime(cm.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-zinc-600">{cm.content}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-zinc-500">
            {error || '无法加载该图文内容'}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
