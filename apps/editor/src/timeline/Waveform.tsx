import type React from 'react';
import { useEffect, useRef } from 'react';

/** 每素材计算一次峰值（1000 桶），渲染时按块宽重采样 */
const peaksCache = new Map<string, Promise<Float32Array>>();
const BUCKETS = 1000;

const computePeaks = async (url: string): Promise<Float32Array> => {
  const buf = await (await fetch(url)).arrayBuffer();
  const audioCtx = new OfflineAudioContext(1, 1, 44100);
  const decoded = await audioCtx.decodeAudioData(buf);
  const data = decoded.getChannelData(0);
  const peaks = new Float32Array(BUCKETS);
  const per = Math.max(1, Math.floor(data.length / BUCKETS));
  for (let i = 0; i < BUCKETS; i++) {
    let max = 0;
    const start = i * per;
    for (let j = start; j < Math.min(start + per, data.length); j += 16) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
};

export const Waveform: React.FC<{ assetId: string; url: string; widthPx: number }> = ({
  assetId,
  url,
  widthPx,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!peaksCache.has(assetId)) peaksCache.set(assetId, computePeaks(url));
    let alive = true;
    peaksCache
      .get(assetId)!
      .then((peaks) => {
        if (!alive) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = Math.max(1, Math.floor(widthPx));
        canvas.width = w;
        canvas.height = 44;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (let x = 0; x < w; x += 2) {
          const p = peaks[Math.floor((x / w) * BUCKETS)] ?? 0;
          const h = Math.max(1, p * 40);
          ctx.fillRect(x, (44 - h) / 2, 1.5, h);
        }
      })
      .catch(() => peaksCache.delete(assetId));
    return () => {
      alive = false;
    };
  }, [assetId, url, widthPx]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
};
