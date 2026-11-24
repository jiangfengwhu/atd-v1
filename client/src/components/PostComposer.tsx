import * as React from 'react';
import { ImagePlus, Link2, Loader2, Hash, X, Crop } from 'lucide-react';
import { api, ApiError, type PostItem, type UserProfile } from '@/lib/api';
import { extractHashtagsFromContent } from '@/lib/hashtags';
import { AvatarBadge } from '@/components/AvatarBadge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { cn } from '@/lib/utils';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

function isSupportedImageFile(file: File): boolean {
  if (file.type && ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name || '');
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
  placeholder = '有什么技术灵感或开发日常？输入 #话题 即可自动打标签，支持拖拽或粘贴图片...',
  submitLabel = '发布',
  autoFocus = false,
  onCreated,
  onCancel,
}: PostComposerProps) {
  const [content, setContent] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');
  const [showUrlInput, setShowUrlInput] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const extractedTags = React.useMemo(() => extractHashtagsFromContent(content), [content]);

  const resetForm = () => {
    setContent('');
    setImageUrl('');
    setShowUrlInput(false);
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCropOpen(false);
    setIsDragging(false);
    setError(null);
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
    setImageUrl('');
    setShowUrlInput(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    acceptImageFile(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt) return;

    let imageFile: File | null = null;
    if (dt.files && dt.files.length > 0) {
      for (const file of Array.from(dt.files)) {
        if (file.type.startsWith('image/') || isSupportedImageFile(file)) {
          imageFile = file;
          break;
        }
      }
    }
    if (!imageFile && dt.items) {
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            imageFile = f;
            break;
          }
        }
      }
    }

    if (imageFile) {
      e.preventDefault();
      e.stopPropagation();
      acceptImageFile(imageFile);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      acceptImageFile(file);
    }
  };

  const clearImage = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageUrl('');
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
      let finalImageUrl = imageUrl.trim();
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

  const activePreview = previewUrl || imageUrl.trim();

  return (
    <>
      <form
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative transition-colors',
          compact
            ? 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card'
            : 'space-y-3',
          isDragging && 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20'
        )}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-500 bg-blue-50/80 backdrop-blur-[1px]">
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
            <Textarea
              id={compact ? 'inline-post-content' : 'dialog-post-content'}
              aria-label="动态正文"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
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
                'resize-none border-slate-200/80 bg-slate-50/50 text-sm leading-relaxed focus:bg-white',
                compact ? 'min-h-[82px]' : 'min-h-[130px]'
              )}
            />

            {extractedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {extractedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600"
                  >
                    <Hash className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {activePreview && (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <img
                  src={activePreview}
                  alt="配图预览"
                  className="max-h-56 w-full object-cover"
                />
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

            {showUrlInput && (
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => {
                    setSelectedFile(null);
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                    setImageUrl(e.target.value);
                  }}
                  placeholder="填入图片链接 https://..."
                  className="h-9 pl-9 text-xs"
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600">
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>{selectedFile ? '更换图片' : '图片'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setShowUrlInput((prev) => !prev)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium transition',
                    showUrlInput
                      ? 'border-blue-200 bg-blue-50 text-blue-600'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800'
                  )}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  <span>外链</span>
                </button>

                <span className="hidden sm:inline text-[11px] text-slate-400 pl-1">
                  支持拖拽 / Ctrl+V 粘贴图片 · #话题
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 tabular-nums">
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
