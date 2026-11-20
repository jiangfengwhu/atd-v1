import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface LightboxImage {
  id: string;
  url: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
}) => {
  if (images.length === 0) return null;
  const safeIndex = Math.max(0, Math.min(currentIndex, images.length - 1));
  const current = images[safeIndex];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="x-lightbox-overlay" />
        <Dialog.Content className="x-lightbox-content">
          <Dialog.Title className="sr-only">图片预览</Dialog.Title>
          <Dialog.Description className="sr-only">
            正在查看第 {safeIndex + 1} 张图片，共 {images.length} 张
          </Dialog.Description>

          <Dialog.Close asChild>
            <button
              type="button"
              className="x-lightbox-close"
              aria-label="关闭图片预览"
            >
              <X size={20} />
            </button>
          </Dialog.Close>

          {images.length > 1 && (
            <button
              type="button"
              className="x-lightbox-nav prev"
              aria-label="上一张"
              onClick={() =>
                onIndexChange((safeIndex - 1 + images.length) % images.length)
              }
            >
              <ChevronLeft size={24} />
            </button>
          )}

          <img
            src={current.url}
            alt={`预览图片 ${safeIndex + 1}`}
            className="x-lightbox-img"
          />

          {images.length > 1 && (
            <button
              type="button"
              className="x-lightbox-nav next"
              aria-label="下一张"
              onClick={() => onIndexChange((safeIndex + 1) % images.length)}
            >
              <ChevronRight size={24} />
            </button>
          )}

          {images.length > 1 && (
            <div className="x-lightbox-counter">
              {safeIndex + 1} / {images.length}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
