import { describe, expect, test } from 'vitest';
import { volumeWithFades } from '../composition/items/MediaItemRenderers';
import type { AudioItem, VideoItem } from '../types';

const base = {
  id: 'i1',
  trackId: 't1',
  from: 0,
  durationInFrames: 100,
  left: 0,
  top: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  borderRadius: 0,
  fadeInDurationInFrames: 0,
  fadeOutDurationInFrames: 0,
  trimBefore: 0,
  playbackRate: 1,
  volume: 0.8,
  muted: false,
};

const video = (opts?: Partial<VideoItem>): VideoItem => ({
  ...base,
  type: 'video',
  assetId: 'a1',
  crop: null,
  ...opts,
});

const audio = (opts?: Partial<AudioItem>): AudioItem => ({
  ...base,
  type: 'audio',
  assetId: 'a1',
  ...opts,
});

/** 取回调在帧 f 的音量；无淡变时返回常量 */
const volAt = (v: number | ((f: number) => number), f: number) => (typeof v === 'number' ? v : v(f));

describe('volumeWithFades', () => {
  test('视频：视觉淡变不影响音量（audioFade 缺省 = 0 ⇒ 常量音量）', () => {
    const v = volumeWithFades(video({ fadeInDurationInFrames: 30, fadeOutDurationInFrames: 30 }));
    expect(v).toBe(0.8);
  });
  test('视频：音频淡变对独立驱动音量', () => {
    const v = volumeWithFades(
      video({ fadeInDurationInFrames: 30, audioFadeInDurationInFrames: 10, audioFadeOutDurationInFrames: 20 }),
    );
    expect(volAt(v, 5)).toBeCloseTo(0.8 * 0.5); // 淡入中点
    expect(volAt(v, 50)).toBeCloseTo(0.8); // 中段全音量
    expect(volAt(v, 90)).toBeCloseTo(0.8 * 0.5); // 淡出中点
    expect(volAt(v, 100)).toBeCloseTo(0);
  });
  test('音频：沿用基础淡变对', () => {
    const v = volumeWithFades(audio({ fadeInDurationInFrames: 10, fadeOutDurationInFrames: 20 }));
    expect(volAt(v, 5)).toBeCloseTo(0.8 * 0.5);
    expect(volAt(v, 90)).toBeCloseTo(0.8 * 0.5);
  });
  test('音频：无淡变返回常量', () => {
    expect(volumeWithFades(audio())).toBe(0.8);
  });
});
