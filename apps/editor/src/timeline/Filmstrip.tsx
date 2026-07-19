import type React from 'react';
import { useEffect, useState } from 'react';
import { ALL_FORMATS, BlobSource, CanvasSink, Input, UrlSource } from 'mediabunny';

const THUMB_W = 48;
const THUMB_H = 44;
/** 逐帧渐进产出后单帧成本极低，上限放宽到 60（2880px 块宽） */
const MAX_THUMBS = 60;

/** 渐进条目：每抽出一帧通知一次订阅者（官方式逐个显示） */
type StripEntry = {
  thumbs: (string | null)[];
  done: boolean;
  listeners: Set<() => void>;
};

/** key 含 url：远程失败的条目不会挡住随后恢复的 blob URL 重试 */
const cache = new Map<string, StripEntry>();

const drawToDataUrl = (source: CanvasImageSource): string => {
  const tmp = document.createElement('canvas');
  tmp.width = THUMB_W;
  tmp.height = THUMB_H;
  tmp.getContext('2d')!.drawImage(source, 0, 0);
  return tmp.toDataURL('image/jpeg', 0.6);
};

/** 回退路径：<video> 逐次 seek 抽帧（WebCodecs 不支持的编码），同样逐帧通知 */
const generateViaVideoElement = async (entry: StripEntry, url: string, count: number) => {
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
  canvas.width = THUMB_W;
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
    ctx.clearRect(0, 0, THUMB_W, THUMB_H);
    ctx.drawImage(video, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
    entry.thumbs[i] = canvas.toDataURL('image/jpeg', 0.6);
    entry.listeners.forEach((l) => l());
  }
  video.src = '';
};

/** 主路径：mediabunny CanvasSink（WebCodecs 硬解，官方同款），逐帧产出立即显示 */
const generateInto = async (entry: StripEntry, url: string, count: number): Promise<void> => {
  const notify = () => entry.listeners.forEach((l) => l());
  let input: Input | null = null;
  try {
    const source = url.startsWith('blob:')
      ? new BlobSource(await (await fetch(url)).blob())
      : new UrlSource(url);
    input = new Input({ formats: ALL_FORMATS, source });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return;
    const duration = await input.computeDuration();
    const sink = new CanvasSink(track, { width: THUMB_W, height: THUMB_H, fit: 'cover' });
    const timestamps = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * duration);
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      if (wrapped) {
        entry.thumbs[i] = drawToDataUrl(wrapped.canvas);
        notify();
      }
      i++;
    }
  } catch {
    await generateViaVideoElement(entry, url, count).catch(() => undefined);
  } finally {
    entry.done = true;
    void input?.dispose();
    notify();
  }
};

export const Filmstrip: React.FC<{ assetId: string; url: string; widthPx: number }> = ({
  assetId,
  url,
  widthPx,
}) => {
  const count = Math.max(1, Math.min(MAX_THUMBS, Math.ceil(widthPx / THUMB_W)));
  const key = `${assetId}:${count}:${url}`;
  const [, force] = useState(0);

  useEffect(() => {
    let entry = cache.get(key);
    if (!entry) {
      entry = { thumbs: Array<string | null>(count).fill(null), done: false, listeners: new Set() };
      cache.set(key, entry);
      void generateInto(entry, url, count);
    }
    const listener = () => force((n) => n + 1);
    entry.listeners.add(listener);
    listener(); // 同步缓存里已有的进度
    return () => {
      entry.listeners.delete(listener);
    };
  }, [key, url, count]);

  const entry = cache.get(key);
  if (!entry) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex overflow-hidden opacity-70">
      {entry.thumbs.map((t, i) => (
        <div
          key={i}
          className="h-full shrink-0"
          style={t ? { width: THUMB_W, backgroundImage: `url(${t})`, backgroundSize: 'cover' } : { width: THUMB_W }}
        />
      ))}
    </div>
  );
};
