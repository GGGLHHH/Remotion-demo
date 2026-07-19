import { describe, expect, test } from 'vitest';
import type { Caption } from '@gedatou/shared';
import { audibleSegment, remapCaptionTimes } from '../captioning';

const cap = (startMs: number, endMs: number): Caption => ({
  text: 'x',
  startMs,
  endMs,
  timestampMs: startMs,
  confidence: null,
});

describe('audibleSegment', () => {
  test('trim 源：偏移 trimBefore 秒，长度 = item 时长', () => {
    expect(audibleSegment({ trimBefore: 60, playbackRate: 1, durationInFrames: 120 }, 30)).toEqual({
      offsetSec: 2,
      durationSec: 4,
    });
  });

  test('2x 变速：片段长度 = item 时长 × 2', () => {
    expect(audibleSegment({ trimBefore: 0, playbackRate: 2, durationInFrames: 120 }, 30)).toEqual({
      offsetSec: 0,
      durationSec: 8,
    });
  });

  test('0.5x 变速：片段长度 = item 时长 × 0.5', () => {
    expect(audibleSegment({ trimBefore: 30, playbackRate: 0.5, durationInFrames: 120 }, 30)).toEqual({
      offsetSec: 1,
      durationSec: 2,
    });
  });
});

describe('remapCaptionTimes', () => {
  test('2x：token 时间减半对齐 item 时间轴', () => {
    expect(remapCaptionTimes([cap(1000, 2000)], 2)).toEqual([
      { ...cap(1000, 2000), startMs: 500, endMs: 1000, timestampMs: 500 },
    ]);
  });

  test('0.5x：token 时间加倍', () => {
    const [c] = remapCaptionTimes([cap(500, 800)], 0.5);
    expect(c.startMs).toBe(1000);
    expect(c.endMs).toBe(1600);
  });

  test('1x 不变；timestampMs 为 null 时保持 null', () => {
    expect(remapCaptionTimes([cap(100, 200)], 1)).toEqual([cap(100, 200)]);
    expect(remapCaptionTimes([{ ...cap(100, 200), timestampMs: null }], 2)[0].timestampMs).toBeNull();
  });
});
