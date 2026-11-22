import * as React from 'react';
import { ImagePlus, Link2, Loader2, Hash, X, Crop } from 'lucide-react';
import { api, ApiError, type PostItem } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { cn } from '@/lib/utils';

const PRESET_TAGS = ['日常碎碎念', '摄影美学', '好物分享', '咖啡时光', '数码桌搭', '城市漫步'];

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (post: PostItem) => void;
}

export function ComposeDialog({ open, onOpenChange, onCreated }: ComposeDialogProps) {
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [customTag, setCustomTag] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setImageUrl('');
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCropOpen(false);
    setSelectedTags([]);
    setCustomTag('');
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 10 * 1024 * 1024) {
      setError('原始图片过大，请选择 10MB 以内的图片');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setImageUrl('');
    e.target.value = '';
  };

  const clearImage = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageUrl('');
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length >= 6
          ? prev
          : [...prev, tag]
    );
  };

  const handleAddCustomTag = () => {
    const clean = customTag.trim().replace(/^#+/, '').slice(0, 20);
    if (!clean) return;
    if (!selectedTags.includes(clean) && selectedTags.length < 6) {
      setSelectedTags((prev) => [...prev, clean]);
    }
    setCustomTag('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) {
      setError('请填写图文标题');
      return;
    }
    if (!trimmedContent) {
      setError('请填写图文正文内容');
      return;
    }
    if (selectedFile && selectedFile.size > 2 * 1024 * 1024) {
      setError('图片大小不能超过 2MB，请先点击「裁剪 / 编辑」进行压缩裁剪');
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
        title: trimmedTitle,
        content: trimmedContent,
        imageUrl: finalImageUrl || undefined,
        tags: selectedTags,
      });

      resetForm();
      onCreated(res.post);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发布失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const activePreview = previewUrl || imageUrl.trim();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">创作新图文</DialogTitle>
            <DialogDescription>
              记录此刻的灵感、生活片段或美学发现，分享给同频的朋友。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="post-title" className="text-xs font-semibold text-zinc-700">
                标题
              </label>
              <Input
                id="post-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="起个吸引人的标题吧"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="post-content" className="text-xs font-semibold text-zinc-700">
                正文内容
              </label>
              <Textarea
                id="post-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={5000}
                placeholder="分享此刻的想法、故事或生活灵感..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-700">
                配图（支持本地上传、裁剪编辑或图片链接）
              </span>

              {activePreview ? (
                <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
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
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-zinc-900"
                      >
                        <Crop className="h-3.5 w-3.5" />
                        裁剪编辑
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearImage}
                      aria-label="移除配图"
                      className="rounded-full bg-zinc-900/75 p-1.5 text-white backdrop-blur transition hover:bg-zinc-900"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 px-3 py-2.5 text-xs font-semibold text-zinc-600 transition hover:border-rose-400 hover:bg-rose-50/40 hover:text-rose-600">
                  <ImagePlus className="h-4 w-4" />
                  <span className="truncate">
                    {selectedFile ? selectedFile.name : '选择本地图片'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>

                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <Input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => {
                      setSelectedFile(null);
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                      setImageUrl(e.target.value);
                    }}
                    placeholder="或填入图片链接 https://..."
                    className="pl-9 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-zinc-700">话题标签（最多 6 个）</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAGS.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition',
                        active
                          ? 'bg-zinc-900 text-white shadow-sm'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                      )}
                    >
                      <Hash className="h-3 w-3" />
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  placeholder="自定义标签，按回车添加"
                  className="h-9 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomTag}
                  className="h-9 rounded-xl"
                >
                  添加
                </Button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button type="submit" variant="gradient" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    发布中...
                  </>
                ) : (
                  '立即发布'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
