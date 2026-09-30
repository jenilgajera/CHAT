import { MAX_AVATAR_CHARS, MAX_IMAGE_CHARS } from '../data/models';

export async function compressDataUrl(
  dataUrl: string,
  maxPx: number,
  quality: number,
  maxChars: number,
): Promise<string> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not compress image.');
  }
  ctx.drawImage(img, 0, 0, w, h);
  let q = quality;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > maxChars && q > 0.3) {
    q -= 0.1;
    out = canvas.toDataURL('image/jpeg', q);
  }
  if (out.length > maxChars) {
    throw new Error('Image is too large even after compression. Try a smaller photo.');
  }
  return out;
}

export function compressChatImage(dataUrl: string): Promise<string> {
  return compressDataUrl(dataUrl, 800, 0.6, MAX_IMAGE_CHARS);
}

export function compressAvatar(dataUrl: string): Promise<string> {
  return compressDataUrl(dataUrl, 240, 0.55, MAX_AVATAR_CHARS);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image.'));
    img.src = src;
  });
}
