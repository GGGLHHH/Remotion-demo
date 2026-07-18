import { MAX_DURATION_ALLOWING_CAPTIONING_IN_SEC } from '@editor/shared';

const SAMPLE_RATE = 16000; // whisper.cpp 要求 16kHz 单声道

/** Float32 采样编码为 PCM16 WAV（44 字节标准头） */
const encodeWav = (samples: Float32Array): Blob => {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
};

/** 从 video/audio 素材 URL（blob 或远端）抽 16kHz 单声道 WAV */
export const extractWav = async (url: string): Promise<Blob> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`素材获取失败: ${res.status}`);
  const data = await res.arrayBuffer();
  // decodeAudioData 会把音频重采样到 context 的 16kHz
  const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(data);
  if (decoded.duration > MAX_DURATION_ALLOWING_CAPTIONING_IN_SEC) {
    throw new Error(`音频超过 ${MAX_DURATION_ALLOWING_CAPTIONING_IN_SEC / 60} 分钟转录上限`);
  }
  // 经 OfflineAudioContext 渲染完成多声道 → 单声道混音
  const ctx = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return encodeWav(rendered.getChannelData(0));
};
