import { describe, expect, it } from 'vitest';

import { formatDb, gainToTopFraction, topFractionToGain, wedgePath } from '../item-block-math';

describe('item-block-math', () => {
  it('formatDb: 官方格式,静音为 -∞', () => {
    expect(formatDb(0)).toBe('-∞ dB');
    expect(formatDb(1)).toBe('0.0 dB'); // 单位增益 = 0 dB
    expect(formatDb(2)).toBe('+6.0 dB'); // 2× ≈ +6.02 → +6.0
  });

  it('gain ↔ topFraction 往返一致(区间内)', () => {
    for (const gain of [0.5, 1, 2, 5]) {
      const f = gainToTopFraction(gain);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      expect(topFractionToGain(f)).toBeCloseTo(gain, 4);
    }
    expect(gainToTopFraction(0)).toBe(1); // 静音在底
    expect(topFractionToGain(1)).toBe(0);
  });

  it('wedgePath: 起点闭合、端点落在 [0,w]×[0,h]', () => {
    const dIn = wedgePath(100, 40, 'in');
    expect(dIn.startsWith('M 0 0 L 0 40')).toBe(true);
    expect(dIn.endsWith('Z')).toBe(true);
    const dOut = wedgePath(100, 40, 'out');
    expect(dOut.startsWith('M 100 0 L 100 40')).toBe(true);
  });
});
