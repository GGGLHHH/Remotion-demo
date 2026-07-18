import { describe, expect, test } from 'vitest';
import { createSolidItem, createTextItem, newId } from '../factories';

describe('factories', () => {
  test('newId 唯一', () => {
    expect(newId()).not.toBe(newId());
  });
  test('createTextItem 默认值', () => {
    const item = createTextItem({ trackId: 't1', from: 30 });
    expect(item.type).toBe('text');
    expect(item.trackId).toBe('t1');
    expect(item.from).toBe(30);
    expect(item.durationInFrames).toBeGreaterThan(0);
    expect(item.text.length).toBeGreaterThan(0);
  });
  test('createSolidItem 默认铺满合成', () => {
    const item = createSolidItem({ trackId: 't1', from: 0, width: 1080, height: 1920 });
    expect(item.type).toBe('solid');
    expect(item.width).toBe(1080);
    expect(item.top).toBe(0);
  });
});
