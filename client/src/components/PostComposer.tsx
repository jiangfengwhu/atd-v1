import * as React from 'react';
import { ArrowUpRight, AtSign, Crop, Globe, Hash, Loader2, X } from 'lucide-react';
import {
  api,
  ApiError,
  type MentionCandidateItem,
  type PostItem,
  type UserProfile,
} from '@/lib/api';
import { extractHashtagsFromContent } from '@/lib/hashtags';
import {
  extractMentionTokens,
  extractMentionTriggerBeforeCaret,
  OFFICIAL_MENTION_ALIASES,
  splitEditorTextByMentions,
  type MentionTrigger,
} from '@/lib/mentions';
import {
  extractUrlsFromContent,
  formatPastedTextWithUrls,
  isLikelyImageUrl,
  parseUrlMeta,
} from '@/lib/urlParser';
import { AvatarBadge } from '@/components/AvatarBadge';
import { OfficialBadge } from '@/components/OfficialBadge';
import { UserHoverCard } from '@/components/UserHoverCard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { cn } from '@/lib/utils';

const OFFICIAL_FEEDBACK_SEED: MentionCandidateItem = {
  id: 'official_feedback',
  nickname: '官方反馈',
  handle: 'official_feedback',
  avatarSeed: 'official_feedback',
  avatarUrl: '',
  bio: 'dev社区官方反馈与建议受理账号，发帖 @官方反馈 即可提交产品建议或问题反馈。',
  isOfficial: true,
  officialBadge: '官方',
};

function createInitialMentionLookup(): Map<string, MentionCandidateItem> {
  const map = new Map<string, MentionCandidateItem>();
  for (const alias of OFFICIAL_MENTION_ALIASES) {
    map.set(alias, OFFICIAL_FEEDBACK_SEED);
  }
  return map;
}

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

function isSupportedImageFile(file: File): boolean {
  const mime = (file.type || '').trim().toLowerCase();
  if (mime) {
    return ALLOWED_IMAGE_TYPES.has(mime);
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name || '');
}

function extractFilesFromTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  if (dt.files && dt.files.length > 0) {
    return Array.from(dt.files);
  }
  if (dt.items && dt.items.length > 0) {
    const out: File[] = [];
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
    return out;
  }
  return [];
}

interface PostComposerProps {
  currentUser?: UserProfile | null;
  compact?: boolean;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onCreated: (post: PostItem) => void;
  onCancel?: () => void;
}

export function PostComposer({
  currentUser,
  compact = false,
  placeholder = '有什么技术灵感或开发日常？#话题 自动打标，拖拽图片或粘贴外链自动识别...',
  submitLabel = '发布',
  autoFocus = false,
  onCreated,
  onCancel,
}: PostComposerProps) {
  const [content, setContent] = React.useState('');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [dismissedImageUrls, setDismissedImageUrls] = React.useState<string[]>([]);
  const [failedImageUrls, setFailedImageUrls] = React.useState<string[]>([]);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mentionTrigger, setMentionTrigger] = React.useState<MentionTrigger | null>(null);
  const [mentionCandidates, setMentionCandidates] = React.useState<MentionCandidateItem[]>([]);
  const [mentionLoading, setMentionLoading] = React.useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = React.useState(0);
  const [resolvedMentionLookup, setResolvedMentionLookup] = React.useState<
    Map<string, MentionCandidateItem>
  >(() => createInitialMentionLookup());

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = React.useRef<HTMLDivElement | null>(null);
  const dragDepthRef = React.useRef(0);
  const isHandlingPasteRef = React.useRef(false);
  const mentionSeqRef = React.useRef(0);
  const checkedMentionTokensRef = React.useRef<Set<string>>(new Set(OFFICIAL_MENTION_ALIASES));
  const pendingCaretRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (pendingCaretRef.current !== null && textareaRef.current) {
      const pos = pendingCaretRef.current;
      pendingCaretRef.current = null;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    }
  }, [content]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const mentionTriggerQuery = mentionTrigger?.query ?? null;
  React.useEffect(() => {
    if (mentionTriggerQuery === null) {
      setMentionCandidates([]);
      setMentionLoading(false);
      setActiveMentionIndex(0);
      return;
    }

    const seq = ++mentionSeqRef.current;
    setMentionLoading(true);
    const delay = mentionTriggerQuery === '' ? 0 : 80;
    const timer = window.setTimeout(() => {
      api
        .searchMentionCandidates(mentionTriggerQuery, 8)
        .then((res) => {
          if (seq !== mentionSeqRef.current) return;
          setMentionCandidates(res.users);
          setActiveMentionIndex(0);
        })
        .catch(() => {
          if (seq !== mentionSeqRef.current) return;
          setMentionCandidates([]);
        })
        .finally(() => {
          if (seq === mentionSeqRef.current) {
            setMentionLoading(false);
          }
        });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [mentionTriggerQuery]);

  const syncBackdropScroll = React.useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const mentionTokensInContent = React.useMemo(() => extractMentionTokens(content), [content]);

  React.useEffect(() => {
    const missing = mentionTokensInContent.filter((tok) => {
      const lower = tok.toLowerCase();
      return !resolvedMentionLookup.has(lower) && !checkedMentionTokensRef.current.has(lower);
    });
    if (missing.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all(
        missing.map(async (tok) => {
          const lower = tok.toLowerCase();
          checkedMentionTokensRef.current.add(lower);
          try {
            const res = await api.searchMentionCandidates(tok, 8);
            const exact =
              res.users.find(
                (u) =>
                  u.nickname.toLowerCase() === lower ||
                  (u.handle && u.handle.toLowerCase() === lower)
              ) ?? null;
            return { lower, candidate: exact };
          } catch {
            return { lower, candidate: null };
          }
        })
      ).then((results) => {
        if (cancelled) return;
        const found = results.filter(
          (r): r is { lower: string; candidate: MentionCandidateItem } => Boolean(r.candidate)
        );
        if (found.length === 0) return;
        setResolvedMentionLookup((prev) => {
          const next = new Map(prev);
          for (const item of found) {
            next.set(item.lower, item.candidate);
            next.set(item.candidate.nickname.toLowerCase(), item.candidate);
          }
          return next;
        });
      });
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mentionTokensInContent, resolvedMentionLookup]);

  const editorSegments = React.useMemo(
    () => splitEditorTextByMentions(content, resolvedMentionLookup),
    [content, resolvedMentionLookup]
  );

  const resolvedMentionsInEditor = React.useMemo(() => {
    const seenIds = new Set<string>();
    const list: MentionCandidateItem[] = [];
    for (const seg of editorSegments) {
      if (seg.type === 'mention' && seg.candidate && !seenIds.has(seg.candidate.id)) {
        seenIds.add(seg.candidate.id);
        list.push(seg.candidate);
      }
    }
    return list;
  }, [editorSegments]);

  const hasOfficialMentionInEditor = React.useMemo(
    () => resolvedMentionsInEditor.some((m) => m.isOfficial),
    [resolvedMentionsInEditor]
  );

  const syncMentionTrigger = React.useCallback((nextValue: string, caretPos: number | null) => {
    const pos = caretPos ?? nextValue.length;
    setMentionTrigger(extractMentionTriggerBeforeCaret(nextValue, pos));
  }, []);

  const insertMention = React.useCallback(
    (candidate: MentionCandidateItem) => {
      if (!mentionTrigger) return;
      const before = content.slice(0, mentionTrigger.start);
      const after = content.slice(mentionTrigger.end);
      const mentionText = `@${candidate.nickname}`;
      const needsTrailingSpace = after === '' || !/^\s/.test(after);
      const inserted = `${mentionText}${needsTrailingSpace ? ' ' : ''}`;
      const nextContent = `${before}${inserted}${after}`.slice(0, 5000);
      const nextCaret = Math.min(before.length + inserted.length, 5000);

      setResolvedMentionLookup((prev) => {
        const next = new Map(prev);
        next.set(candidate.nickname.toLowerCase(), candidate);
        if (candidate.handle) next.set(candidate.handle.toLowerCase(), candidate);
        return next;
      });

      pendingCaretRef.current = nextCaret;
      setContent(nextContent);
      setMentionTrigger(null);
      setMentionCandidates([]);
      setActiveMentionIndex(0);
    },
    [content, mentionTrigger]
  );

  const extractedTags = React.useMemo(
    () => extractHashtagsFromContent(content),
    [content]
  );

  const detectedUrls = React.useMemo(
    () => extractUrlsFromContent(content),
    [content]
  );

  const detectedUrlMetas = React.useMemo(
    () => detectedUrls.map((url) => parseUrlMeta(url)),
    [detectedUrls]
  );

  const autoImageUrl = React.useMemo(() => {
    if (selectedFile) return '';
    const candidate = detectedUrls.find(
      (url) =>
        isLikelyImageUrl(url) &&
        !dismissedImageUrls.includes(url) &&
        !failedImageUrls.includes(url)
    );
    return candidate ?? '';
  }, [selectedFile, detectedUrls, dismissedImageUrls, failedImageUrls]);

  const resetForm = () => {
    setContent('');
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDismissedImageUrls([]);
    setFailedImageUrls([]);
    setCropOpen(false);
    dragDepthRef.current = 0;
    setIsDragging(false);
    setError(null);
    setMentionTrigger(null);
    setMentionCandidates([]);
    setActiveMentionIndex(0);
  };

  const acceptImageFile = (file: File) => {
    setError(null);
    if (!isSupportedImageFile(file)) {
      setError('仅支持 PNG、JPEG、WEBP 或 GIF 格式图片');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('原始图片过大，请选择 10MB 以内的图片');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (isHandlingPasteRef.current) return;
    const dt = e.clipboardData;
    if (!dt) return;

    isHandlingPasteRef.current = true;
    try {
      const files = extractFilesFromTransfer(dt);
      if (files.length > 0) {
        const imageFile = files.find((file) => isSupportedImageFile(file)) ?? null;
        if (imageFile) {
          e.preventDefault();
          e.stopPropagation();
          acceptImageFile(imageFile);
          return;
        }
        // Reject non-image pasted files if no plain text is present
        const plainText = dt.getData('text/plain');
        if (!plainText) {
          e.preventDefault();
          e.stopPropagation();
          setError('仅支持粘贴 PNG、JPEG、WEBP 或 GIF 格式图片');
          return;
        }
      }

      const pastedText = dt.getData('text/plain');
      if (!pastedText) return;

      const urlsInPaste = extractUrlsFromContent(pastedText);
      // Never intercept plain text without URLs — let native browser paste handle it cleanly
      if (urlsInPaste.length === 0) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setError(null);

      const el = textareaRef.current;
      const isFocused = Boolean(el && document.activeElement === el);
      const start = isFocused && el ? (el.selectionStart ?? content.length) : content.length;
      const end = isFocused && el ? (el.selectionEnd ?? content.length) : content.length;
      const before = content.slice(0, start);
      const after = content.slice(end);
      const beforeChar = before.slice(-1);
      const afterChar = after.slice(0, 1);

      const formatted = formatPastedTextWithUrls(pastedText, beforeChar, afterChar);
      const nextContent = `${before}${formatted}${after}`.slice(0, 5000);
      const nextCaret = Math.min(before.length + formatted.length, 5000);

      // Re-enable preview if user explicitly pastes a previously dismissed image URL
      const pastedImageUrls = urlsInPaste.filter((u) => isLikelyImageUrl(u));
      if (pastedImageUrls.length > 0) {
        setDismissedImageUrls((prev) =>
          prev.filter((u) => !pastedImageUrls.includes(u))
        );
        setFailedImageUrls((prev) =>
          prev.filter((u) => !pastedImageUrls.includes(u))
        );
      }

      if (el) {
        pendingCaretRef.current = nextCaret;
      }
      setContent(nextContent);
    } finally {
      isHandlingPasteRef.current = false;
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0 || !e.currentTarget.contains(e.relatedTarget as Node)) {
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);

    const files = extractFilesFromTransfer(e.dataTransfer);
    if (files.length === 0) return;

    const imageFile = files.find((f) => isSupportedImageFile(f));
    if (!imageFile) {
      setError('仅支持拖入 PNG、JPEG、WEBP 或 GIF 格式图片');
      return;
    }
    acceptImageFile(imageFile);
  };

  const clearImage = () => {
    if (selectedFile || previewUrl) {
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    } else if (autoImageUrl) {
      setDismissedImageUrls((prev) =>
        prev.includes(autoImageUrl) ? prev : [...prev, autoImageUrl]
      );
    }
  };

  const submitPost = async () => {
    setError(null);
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('请填写动态正文内容');
      return;
    }
    if (trimmedContent.length > 5000) {
      setError('正文内容不能超过 5000 个字符');
      return;
    }
    if (selectedFile && selectedFile.size > 2 * 1024 * 1024) {
      setError('图片大小不能超过 2MB，请先点击「裁剪编辑」进行压缩裁剪');
      return;
    }

    setSubmitting(true);
    try {
      let finalImageUrl = autoImageUrl;
      if (selectedFile) {
        const uploaded = await api.uploadImage(selectedFile);
        finalImageUrl = uploaded.url;
      }

      const res = await api.createPost({
        content: trimmedContent,
        imageUrl: finalImageUrl || undefined,
      });

      resetForm();
      onCreated(res.post);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发布失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPost();
  };

  const activePreview = previewUrl || autoImageUrl;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="post-composer-form"
        className={cn(
          'relative transition-colors',
          compact
            ? 'rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-card dark:border-slate-800 dark:bg-slate-900/90'
            : 'space-y-3',
          isDragging && 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 dark:bg-blue-950/30'
        )}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-500 bg-blue-50/80 backdrop-blur-[1px] dark:bg-blue-950/80">
            <span className="rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
              松开即可添加配图
            </span>
          </div>
        )}

        <div className={cn('flex gap-3', !compact && 'flex-col')}>
          {compact && currentUser && (
            <AvatarBadge
              nickname={currentUser.nickname}
              seed={currentUser.avatarSeed}
              avatarUrl={currentUser.avatarUrl}
              size="md"
              className="mt-0.5 shrink-0"
            />
          )}

          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="relative rounded-xl bg-slate-50/50 transition-colors focus-within:bg-white dark:bg-slate-800/70 dark:focus-within:bg-slate-800">
              {content.length > 0 && (
                <div
                  ref={backdropRef}
                  aria-hidden="true"
                  data-testid="composer-highlight-layer"
                  className={cn(
                    'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-xl border border-transparent px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 dark:text-slate-100',
                    compact ? 'min-h-[84px]' : 'min-h-[136px]'
                  )}
                >
                  {editorSegments.map((seg, idx) =>
                    seg.type === 'mention' ? (
                      <mark
                        key={`hl-${idx}`}
                        data-testid="composer-mention-highlight"
                        data-mention-official={seg.candidate?.isOfficial ? 'true' : 'false'}
                        className={cn(
                          'rounded-sm px-0 text-inherit',
                          seg.candidate?.isOfficial
                            ? 'bg-indigo-100 text-indigo-700 underline decoration-indigo-400 decoration-2 underline-offset-2 dark:bg-indigo-950/80 dark:text-indigo-300'
                            : seg.candidate
                              ? 'bg-blue-100 text-blue-700 underline decoration-blue-400 decoration-2 underline-offset-2 dark:bg-blue-950/80 dark:text-blue-300'
                              : 'bg-sky-100/80 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300'
                        )}
                      >
                        {seg.raw}
                      </mark>
                    ) : (
                      <React.Fragment key={`txt-${idx}`}>{seg.value}</React.Fragment>
                    )
                  )}
                  {content.endsWith('\n') ? '\n' : null}
                </div>
              )}

              <Textarea
                ref={textareaRef}
                id={compact ? 'inline-post-content' : 'dialog-post-content'}
                aria-label="动态正文"
                value={content}
                onScroll={syncBackdropScroll}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setContent(nextVal);
                  syncMentionTrigger(nextVal, e.target.selectionStart);
                  syncBackdropScroll();
                }}
                onClick={(e) => {
                  syncMentionTrigger(e.currentTarget.value, e.currentTarget.selectionStart);
                }}
                onKeyUp={(e) => {
                  if (
                    e.key === 'ArrowLeft' ||
                    e.key === 'ArrowRight' ||
                    e.key === 'Home' ||
                    e.key === 'End'
                  ) {
                    syncMentionTrigger(e.currentTarget.value, e.currentTarget.selectionStart);
                  }
                }}
                onBlur={() => {
                  setMentionTrigger(null);
                }}
                onKeyDown={(e) => {
                  if (mentionTrigger !== null) {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setMentionTrigger(null);
                      return;
                    }
                    if (mentionCandidates.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActiveMentionIndex((i) => (i + 1) % mentionCandidates.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveMentionIndex(
                          (i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length
                        );
                        return;
                      }
                      if (
                        (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) ||
                        e.key === 'Tab'
                      ) {
                        e.preventDefault();
                        const target =
                          mentionCandidates[activeMentionIndex] ?? mentionCandidates[0];
                        if (target) insertMention(target);
                        return;
                      }
                    }
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !submitting) {
                    e.preventDefault();
                    submitPost();
                  }
                }}
                maxLength={5000}
                autoFocus={autoFocus}
                placeholder={placeholder}
                rows={compact ? 3 : 5}
                className={cn(
                  'relative z-10 resize-none border-slate-200/80 text-sm leading-relaxed dark:border-slate-700/80',
                  content.length > 0
                    ? 'bg-transparent text-transparent caret-slate-900 selection:bg-blue-500/20 focus:bg-transparent dark:bg-transparent dark:text-transparent dark:caret-slate-100 dark:focus:bg-transparent'
                    : 'bg-transparent text-slate-900 focus:bg-transparent dark:bg-transparent dark:text-slate-100 dark:focus:bg-transparent',
                  compact ? 'min-h-[84px]' : 'min-h-[136px]'
                )}
              />

              {mentionTrigger !== null && (
                <div
                  role="listbox"
                  aria-label="提及用户列表"
                  data-testid="mention-popover"
                  className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <AtSign className="h-3 w-3 text-blue-500" />
                      选择要提及的账号
                    </span>
                    <span>↑↓ 选择 · Enter 插入</span>
                  </div>

                  {mentionLoading && mentionCandidates.length === 0 ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      <span>正在匹配用户...</span>
                    </div>
                  ) : mentionCandidates.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-400">
                      未找到匹配用户，可直接发布保留文本
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {mentionCandidates.map((candidate, idx) => {
                        const isActive = idx === activeMentionIndex;
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            data-testid={`mention-option-${candidate.id}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setActiveMentionIndex(idx)}
                            onClick={() => insertMention(candidate)}
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
                              isActive
                                ? 'bg-blue-50 text-slate-900 dark:bg-blue-950/70 dark:text-slate-100'
                                : candidate.isOfficial
                                  ? 'bg-blue-50/40 text-slate-800 hover:bg-blue-50 dark:bg-blue-950/30 dark:text-slate-200 dark:hover:bg-blue-950/50'
                                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                            )}
                          >
                            <AvatarBadge
                              nickname={candidate.nickname}
                              seed={candidate.avatarSeed}
                              avatarUrl={candidate.avatarUrl}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                                  {candidate.nickname}
                                </span>
                                {candidate.isOfficial && (
                                  <OfficialBadge label={candidate.officialBadge} />
                                )}
                              </div>
                              <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                                {candidate.bio || `@${candidate.handle || candidate.nickname}`}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {resolvedMentionsInEditor.length > 0 && (
              <div
                data-testid="composer-mention-preview"
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">提及预览：</span>
                {resolvedMentionsInEditor.map((item) => (
                  <UserHoverCard
                    key={item.id}
                    userId={item.id}
                    initialUser={item}
                  >
                    <span
                      tabIndex={0}
                      data-testid="composer-mention-chip"
                      data-mention-user-id={item.id}
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition',
                        item.isOfficial
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-950'
                          : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-950'
                      )}
                    >
                      <span>@{item.nickname}</span>
                      {item.isOfficial && <OfficialBadge label={item.officialBadge} />}
                    </span>
                  </UserHoverCard>
                ))}
                {hasOfficialMentionInEditor && (
                  <span
                    data-testid="composer-feedback-hint"
                    className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800"
                  >
                    发布后将自动创建反馈工单
                  </span>
                )}
              </div>
            )}

            {extractedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {extractedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                  >
                    <Hash className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {detectedUrlMetas.length > 0 && (
              <div
                data-testid="composer-detected-links"
                className="flex flex-wrap items-center gap-1.5"
              >
                {detectedUrlMetas.map((meta) => (
                  <a
                    key={meta.url}
                    href={meta.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={meta.url}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-blue-200/80 bg-blue-50/70 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800/80 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950"
                  >
                    <Globe className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                    <span className="truncate">
                      {meta.host}
                      {meta.pathPreview ? (
                        <span className="text-blue-500/80 dark:text-blue-400/80">{meta.pathPreview}</span>
                      ) : null}
                    </span>
                    <ArrowUpRight className="h-3 w-3 shrink-0 text-blue-400" />
                  </a>
                ))}
              </div>
            )}

            {activePreview && (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <img
                  src={activePreview}
                  alt="配图预览"
                  onError={() => {
                    if (!previewUrl && autoImageUrl) {
                      setFailedImageUrls((prev) =>
                        prev.includes(autoImageUrl) ? prev : [...prev, autoImageUrl]
                      );
                    }
                  }}
                  className="max-h-56 w-full object-cover"
                />
                {!previewUrl && autoImageUrl && (
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                    已识别图片外链
                  </span>
                )}
                <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
                  {previewUrl && (
                    <button
                      type="button"
                      onClick={() => setCropOpen(true)}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-slate-900"
                    >
                      <Crop className="h-3.5 w-3.5" />
                      裁剪编辑
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearImage}
                    aria-label="移除配图"
                    className="rounded-full bg-slate-900/75 p-1.5 text-white backdrop-blur transition hover:bg-slate-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-400"
              >
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-0.5">
              <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                支持 @提及 · 拖拽 / 粘贴图片 · 粘贴外链自动识别 · #话题
              </p>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                <span className="text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                  {content.length}/5000
                </span>
                {onCancel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                    disabled={submitting}
                  >
                    取消
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="gradient"
                  size={compact ? 'sm' : 'default'}
                  disabled={submitting || !content.trim()}
                  className={cn(compact ? 'h-8 px-4 text-xs' : 'h-9 px-5 text-sm')}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      发布中...
                    </>
                  ) : (
                    submitLabel
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>

      <ImageCropDialog
        open={cropOpen}
        imageSrc={previewUrl}
        mode="post"
        fileName={selectedFile?.name || 'post-image.png'}
        onClose={() => setCropOpen(false)}
        onConfirm={(croppedFile) => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setSelectedFile(croppedFile);
          setPreviewUrl(URL.createObjectURL(croppedFile));
        }}
      />
    </>
  );
}
