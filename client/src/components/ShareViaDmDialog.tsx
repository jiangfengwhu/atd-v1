import * as React from 'react';
import { Check, Loader2, Search, Send, Users, X } from 'lucide-react';
import {
  api,
  ApiError,
  type PostItem,
  type ShareRecipientItem,
} from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AvatarBadge } from '@/components/AvatarBadge';
import { OfficialBadge } from '@/components/OfficialBadge';
import { cn } from '@/lib/utils';

const MAX_RECIPIENTS = 10;

interface ShareViaDmDialogProps {
  post: PostItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShared: (postId: string, sharesCount: number, sentCount: number) => void;
  onToast?: (message: string) => void;
}

function getRelationshipTag(user: ShareRecipientItem): string | null {
  if (user.hasConversation) return '最近私信';
  if (user.isMutualFollow) return '互相关注';
  if (user.isFollowing) return '已关注';
  if (user.isFollower) return '关注了我';
  return null;
}

export function ShareViaDmDialog({
  post,
  open,
  onOpenChange,
  onShared,
  onToast,
}: ShareViaDmDialogProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [recipients, setRecipients] = React.useState<ShareRecipientItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = React.useState<ShareRecipientItem[]>([]);
  const [note, setNote] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedUsers([]);
      setNote('');
      setLoadError(null);
      setSubmitError(null);
    }
  }, [open, post?.id]);

  const fetchRecipients = React.useCallback(async (q: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.listShareRecipients(q, 15);
      setRecipients(res.recipients);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '加载好友列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const trimmed = searchQuery.trim();
    const delay = trimmed ? 160 : 0;
    const timer = window.setTimeout(() => {
      fetchRecipients(trimmed);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [open, searchQuery, fetchRecipients]);

  const selectedIds = React.useMemo(
    () => new Set(selectedUsers.map((u) => u.id)),
    [selectedUsers]
  );

  const toggleRecipient = (candidate: ShareRecipientItem) => {
    setSubmitError(null);
    if (selectedIds.has(candidate.id)) {
      setSelectedUsers((prev) => prev.filter((u) => u.id !== candidate.id));
      return;
    }
    if (selectedUsers.length >= MAX_RECIPIENTS) {
      setSubmitError(`单次最多可选择 ${MAX_RECIPIENTS} 位好友`);
      return;
    }
    setSelectedUsers((prev) => [...prev, candidate]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || selectedUsers.length === 0 || sending) return;

    setSending(true);
    setSubmitError(null);
    try {
      const res = await api.sharePostViaDm(post.id, {
        recipientIds: selectedUsers.map((u) => u.id),
        note: note.trim(),
      });
      onShared(post.id, res.sharesCount, res.sentCount);
      onToast?.(
        res.sentCount > 1
          ? `已私信分享给 ${res.sentCount} 位好友`
          : `已私信分享给 ${selectedUsers[0].nickname}`
      );
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : '发送私信分享失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open && Boolean(post)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle>通过私信分享动态</DialogTitle>
          <DialogDescription>
            选择站内好友（最多 {MAX_RECIPIENTS} 位），将这条动态发送到私信对话
          </DialogDescription>
        </DialogHeader>

        {post && (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Shared Post Preview */}
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <AvatarBadge
                nickname={post.author.nickname}
                seed={post.author.avatarSeed}
                avatarUrl={post.author.avatarUrl}
                size="sm"
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                    {post.author.nickname}
                  </span>
                  {post.author.isOfficial && (
                    <OfficialBadge label={post.author.officialBadge} />
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {post.content}
                </p>
              </div>
              {post.imageUrl && (
                <img
                  src={post.imageUrl}
                  alt="动态缩略图"
                  className="h-12 w-12 shrink-0 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                />
              )}
            </div>

            {/* Selected Recipient Chips */}
            {selectedUsers.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>已选好友 ({selectedUsers.length}/{MAX_RECIPIENTS})</span>
                  <button
                    type="button"
                    onClick={() => setSelectedUsers([])}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    清空
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedUsers.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:ring-blue-800"
                    >
                      <span className="max-w-[120px] truncate">{u.nickname}</span>
                      <button
                        type="button"
                        aria-label={`移除 ${u.nickname}`}
                        onClick={() => toggleRecipient(u)}
                        className="rounded-full p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索好友或社区用户昵称..."
                maxLength={30}
                className="h-9 rounded-xl pl-9 pr-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="清空搜索"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Candidate List */}
            <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/60">
              {loading ? (
                <div className="flex h-36 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                </div>
              ) : loadError ? (
                <div className="flex h-36 flex-col items-center justify-center gap-2 px-4 text-center">
                  <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fetchRecipients(searchQuery.trim())}
                    className="h-7 text-xs"
                  >
                    重试
                  </Button>
                </div>
              ) : recipients.length === 0 ? (
                <div className="flex h-36 flex-col items-center justify-center gap-1.5 px-4 text-center">
                  <Users className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {searchQuery.trim() ? '未找到匹配昵称的用户' : '暂无可私信的好友'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recipients.map((candidate) => {
                    const isSelected = selectedIds.has(candidate.id);
                    const relTag = getRelationshipTag(candidate);
                    return (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() => toggleRecipient(candidate)}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition',
                            isSelected
                              ? 'bg-blue-50/80 dark:bg-blue-950/50'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <AvatarBadge
                              nickname={candidate.nickname}
                              seed={candidate.avatarSeed}
                              avatarUrl={candidate.avatarUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  {candidate.nickname}
                                </span>
                                {candidate.isOfficial && (
                                  <OfficialBadge label={candidate.officialBadge} />
                                )}
                                {relTag && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {relTag}
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                                {candidate.bio || '点击选择该用户'}
                              </p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition',
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Optional Note */}
            <div className="space-y-1">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="给好友捎句话或附言（选填）..."
                maxLength={1000}
                rows={2}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {note.length > 0 && (
                <div className="text-right text-[10px] text-slate-400 dark:text-slate-500">
                  {note.length}/1000
                </div>
              )}
            </div>

            {submitError && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/60 dark:text-red-400">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={sending}
              >
                取消
              </Button>
              <Button
                type="submit"
                variant="gradient"
                size="sm"
                disabled={sending || selectedUsers.length === 0}
                className="min-w-[92px]"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {selectedUsers.length > 0 ? `发送 (${selectedUsers.length})` : '发送'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
