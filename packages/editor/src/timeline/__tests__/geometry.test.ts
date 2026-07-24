import { describe, expect, it } from 'vitest';
import type { UndoableState } from '@gedatou/shared';

import { AUDIO_TRACK_HEIGHT, MEDIA_TRACK_HEIGHT, RULER_HEIGHT, TRACK_HEIGHT } from '../constants';
import { rowHeightOf, rowTops, trackIndexAtY } from '../geometry';

// 最小 state:只喂 geometry 读到的字段(tracks[].id、items[].trackId/type)。
const st = (tracks: string[], items: { trackId: string; type: string }[]): UndoableState =>
  ({
    tracks: tracks.map((id) => ({ id })),
    items: Object.fromEntries(items.map((it, i) => [String(i), it])),
  }) as unknown as UndoableState;

describe('timeline geometry', () => {
  it('rowHeightOf:视频轨最高,纯音频次之,其余基础', () => {
    const s = st(
      ['t1', 't2', 't3'],
      [
        { trackId: 't1', type: 'video' },
        { trackId: 't2', type: 'audio' },
        { trackId: 't3', type: 'text' },
      ],
    );
    expect(rowHeightOf(s, 't1')).toBe(MEDIA_TRACK_HEIGHT);
    expect(rowHeightOf(s, 't2')).toBe(AUDIO_TRACK_HEIGHT);
    expect(rowHeightOf(s, 't3')).toBe(TRACK_HEIGHT);
    expect(rowHeightOf(s, 'empty')).toBe(TRACK_HEIGHT);
  });

  it('rowTops:从 RULER_HEIGHT 起的前缀和', () => {
    const s = st(['t1', 't2'], [{ trackId: 't1', type: 'video' }]);
    expect(rowTops(s)).toEqual([
      RULER_HEIGHT,
      RULER_HEIGHT + MEDIA_TRACK_HEIGHT,
      RULER_HEIGHT + MEDIA_TRACK_HEIGHT + TRACK_HEIGHT,
    ]);
  });

  it('trackIndexAtY:标尺内 -1、逐行命中、底行之下 = n', () => {
    const s = st(['t1', 't2'], [{ trackId: 't1', type: 'video' }]);
    expect(trackIndexAtY(s, RULER_HEIGHT - 1)).toBe(-1);
    expect(trackIndexAtY(s, RULER_HEIGHT + 1)).toBe(0);
    expect(trackIndexAtY(s, RULER_HEIGHT + MEDIA_TRACK_HEIGHT + 1)).toBe(1);
    expect(trackIndexAtY(s, 9999)).toBe(2);
  });
});
