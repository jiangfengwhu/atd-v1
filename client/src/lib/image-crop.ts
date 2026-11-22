import type { Area } from 'react-easy-crop';

const MAX_EXPORT_BYTES = 2 * 1024 * 1024; // 2MB

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (err) => reject(err));
    if (!url.startsWith('blob:') && !url.startsWith('data:') && !url.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = url;
  });
}

function getRadianAngle(degreeValue: number): number {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: Area | null,
  rotation = 0,
  fileName = 'cropped-image.jpg'
): Promise<File> {
  const image = await createImage(imageSrc);
  const rotRad = getRadianAngle(rotation);

  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    rotation
  );

  const stageCanvas = document.createElement('canvas');
  stageCanvas.width = Math.max(1, Math.round(bBoxWidth));
  stageCanvas.height = Math.max(1, Math.round(bBoxHeight));
  const stageCtx = stageCanvas.getContext('2d');
  if (!stageCtx) {
    throw new Error('浏览器不支持 Canvas 2D 编辑');
  }

  stageCtx.translate(stageCanvas.width / 2, stageCanvas.height / 2);
  stageCtx.rotate(rotRad);
  stageCtx.translate(-image.width / 2, -image.height / 2);
  stageCtx.drawImage(image, 0, 0);

  const crop = pixelCrop ?? {
    x: 0,
    y: 0,
    width: stageCanvas.width,
    height: stageCanvas.height,
  };

  const targetWidth = Math.max(1, Math.round(crop.width));
  const targetHeight = Math.max(1, Math.round(crop.height));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    throw new Error('无法创建输出画布');
  }

  outCtx.drawImage(
    stageCanvas,
    Math.round(crop.x),
    Math.round(crop.y),
    targetWidth,
    targetHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  // Try PNG first if image is modest, otherwise compress cleanly as JPEG <= 2MB
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'cropped';
  const pngBlob = await canvasToBlob(outCanvas, 'image/png');
  if (pngBlob && pngBlob.size <= MAX_EXPORT_BYTES) {
    return new File([pngBlob], `${baseName}.png`, { type: 'image/png' });
  }

  // Fill white background for JPEG export in case source had transparency
  const jpegCanvas = document.createElement('canvas');
  jpegCanvas.width = targetWidth;
  jpegCanvas.height = targetHeight;
  const jpegCtx = jpegCanvas.getContext('2d');
  if (jpegCtx) {
    jpegCtx.fillStyle = '#ffffff';
    jpegCtx.fillRect(0, 0, targetWidth, targetHeight);
    jpegCtx.drawImage(outCanvas, 0, 0);
  }
  const sourceForJpeg = jpegCtx ? jpegCanvas : outCanvas;

  for (const quality of [0.92, 0.82, 0.7, 0.56, 0.42]) {
    const blob = await canvasToBlob(sourceForJpeg, 'image/jpeg', quality);
    if (blob && blob.size <= MAX_EXPORT_BYTES) {
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    }
  }

  // Last resort: downscale to fit within 2MB
  const scale = 0.6;
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = Math.max(1, Math.round(targetWidth * scale));
  smallCanvas.height = Math.max(1, Math.round(targetHeight * scale));
  const smallCtx = smallCanvas.getContext('2d');
  if (smallCtx) {
    smallCtx.drawImage(sourceForJpeg, 0, 0, smallCanvas.width, smallCanvas.height);
    const finalBlob = await canvasToBlob(smallCanvas, 'image/jpeg', 0.78);
    if (finalBlob) {
      return new File([finalBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
    }
  }

  throw new Error('图片体积过大，导出失败');
}
