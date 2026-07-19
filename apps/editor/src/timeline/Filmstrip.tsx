import type React from 'react';
import { useEffect, useState } from 'react';

/** 按 assetId+档位缓存生成的胶片 dataURL，避免重复抽帧 */
const cache = new Map<string, Promise<string>>();

const THUMB_W = 48;
const THUMB_H = 44;

const generate = async (url: string, count: number): Promise<string> => {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  // 远程素材（MinIO）需带 CORS 凭据加载，否则 canvas 被污染、toDataURL 抛 SecurityError
  video.crossOrigin = 'anonymous';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('video load failed'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W * count;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count) * video.duration;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = t;
    });
    const scale = Math.max(THUMB_W / video.videoWidth, THUMB_H / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    ctx.drawImage(video, i * THUMB_W + (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
  }
  video.src = '';
  return canvas.toDataURL('image/jpeg', 0.6);
};

export const Filmstrip: React.FC<{ assetId: string; url: string; widthPx: number }> = ({
  assetId,
  url,
  widthPx,
}) => {
  const count = Math.max(1, Math.min(20, Math.ceil(widthPx / THUMB_W)));
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    // key 含 url：远程失败的 Promise 不会挡住随后恢复的 blob URL 重试
    const key = `${assetId}:${count}:${url}`;
    if (!cache.has(key)) cache.set(key, generate(url, count));
    let alive = true;
    cache
      .get(key)!
      .then((u) => {
        if (alive) setDataUrl(u);
      })
      .catch(() => cache.delete(key));
    return () => {
      alive = false;
    };
  }, [assetId, url, count]);

  if (!dataUrl) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-70"
      style={{ backgroundImage: `url(${dataUrl})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }}
    />
  );
};
