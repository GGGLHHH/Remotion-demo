import { describe, expect, it } from 'vitest';
import { TRANSITION_PRESETS, presetIdOf } from './transition-presets';

describe('TRANSITION_PRESETS', () => {
  it('has unique ids', () => {
    const ids = TRANSITION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has a legal type and (for non-fade) a direction', () => {
    for (const p of TRANSITION_PRESETS) {
      expect(['fade', 'slide', 'wipe', 'zoom']).toContain(p.type);
      if (p.type === 'fade') expect(p.direction).toBeUndefined();
      else expect(['left', 'right', 'up', 'down', 'in', 'out']).toContain(p.direction);
    }
  });

  it('covers the intended 11-preset set', () => {
    expect(TRANSITION_PRESETS.map((p) => p.id)).toEqual([
      'fade',
      'slide-left', 'slide-right', 'slide-up', 'slide-down',
      'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down',
      'zoom-in', 'zoom-out',
    ]);
  });
});

describe('presetIdOf', () => {
  it('maps (type,direction) back to preset id', () => {
    expect(presetIdOf({ type: 'slide', direction: 'left' })).toBe('slide-left');
    expect(presetIdOf({ type: 'zoom', direction: 'out' })).toBe('zoom-out');
    expect(presetIdOf({ type: 'fade' })).toBe('fade');
  });

  it('falls back to fade for unknown combinations', () => {
    expect(presetIdOf({ type: 'zoom', direction: 'left' })).toBe('fade');
    expect(presetIdOf({ type: 'slide' })).toBe('fade'); // slide 无 direction 非法组合
  });
});
