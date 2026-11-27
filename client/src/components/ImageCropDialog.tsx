import * as React from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { RotateCcw, RotateCw, ZoomIn, Loader2, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getCroppedImageFile } from '@/lib/image-crop';
import { cn } from '@/lib/utils';

const ASPECT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
];

interface ImageCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  mode?: 'post' | 'avatar';
  fileName?: string;
  onClose: () => void;
  onConfirm: (croppedFile: File) => void;
}

export function ImageCropDialog({
  open,
  imageSrc,
  mode = 'post',
  fileName = 'image.png',
  onClose,
  onConfirm,
}: ImageCropDialogProps) {
  const [crop, setCrop] = React.useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [aspect, setAspect] = React.useState<number>(mode === 'avatar' ? 1 : 4 / 3);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setAspect(mode === 'avatar' ? 1 : 4 / 3);
      setCroppedAreaPixels(null);
      setError(null);
    }
  }, [open, mode, imageSrc]);

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspect(mode === 'avatar' ? 1 : 4 / 3);
  };

  const handleConfirm = async () => {
    if (!imageSrc) return;
    setProcessing(true);
    setError(null);
    try {
      const file = await getCroppedImageFile(imageSrc, croppedAreaPixels, rotation, fileName);
      onConfirm(file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片裁剪失败，请重试');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'avatar' ? '裁剪个人头像' : '编辑与裁剪图片'}</DialogTitle>
          <DialogDescription>
            {mode === 'avatar'
              ? '拖拽与缩放调整头像构图，保存后自动压缩至 2MB 以内。'
              : '支持拖拽构图、缩放、90° 旋转与常见比例切换。'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="relative h-72 sm:h-80 w-full overflow-hidden rounded-2xl bg-zinc-900">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={mode === 'avatar' ? 1 : aspect}
                cropShape={mode === 'avatar' ? 'round' : 'rect'}
                showGrid={mode !== 'avatar'}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            )}
          </div>

          {mode !== 'avatar' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-zinc-500 dark:text-slate-400">比例</span>
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setAspect(opt.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold transition',
                    Math.abs(aspect - opt.value) < 0.01
                      ? 'bg-zinc-900 text-white dark:bg-blue-600'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/70">
            <div className="flex items-center gap-3">
              <ZoomIn className="h-4 w-4 shrink-0 text-zinc-500 dark:text-slate-400" />
              <span className="text-xs font-medium text-zinc-600 dark:text-slate-300">缩放</span>
              <input
                type="range"
                aria-label="缩放比例"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-rose-500"
              />
              <span className="w-10 text-right text-xs tabular-nums text-zinc-500 dark:text-slate-400">
                {zoom.toFixed(1)}x
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRotation((r) => (r - 90) % 360)}
                  className="h-8 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  向左旋转
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="h-8 text-xs"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  向右旋转
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleReset}
                className="h-8 text-xs"
              >
                重置
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={processing}>
              取消
            </Button>
            <Button type="button" variant="gradient" onClick={handleConfirm} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  确认裁剪
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
