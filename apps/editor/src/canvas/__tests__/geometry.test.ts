import { describe, expect, test } from 'vitest';
import {
  createEmptyState,
  createSolidItem,
  createTrack,
} from '@editor/shared';
import { hitTest, resizeRect, topmostItemAt } from '../geometry';

describe('hitTest', () => {
  const rect = { left: 100, top: 100, width: 200, height: 100 };
  test('未旋转命中', () => {
    expect(hitTest(rect, 0, 150, 150)).toBe(true);
    expect(hitTest(rect, 0, 99, 150)).toBe(false);
    expect(hitTest(rect, 0, 150, 250)).toBe(false);
  });
  test('旋转 90° 后命中区域翻转', () => {
    // 中心 (200,150)，旋转 90° 后宽高对调：x∈[150,250], y∈[50,250]
    expect(hitTest(rect, 90, 200, 60)).toBe(true);
    expect(hitTest(rect, 90, 105, 150)).toBe(false); // 原区域左端不再命中
  });
});

describe('topmostItemAt', () => {
  const build = () => {
    const state = createEmptyState({ width: 1000, height: 1000 });
    const top = createTrack('top');
    const bottom = createTrack('bottom');
    state.tracks = [top, bottom];
    const a = createSolidItem({ trackId: top.id, from: 0, width: 500, height: 500 });
    const b = createSolidItem({ trackId: bottom.id, from: 0, width: 500, height: 500 });
    state.items = { [a.id]: a, [b.id]: b };
    return { state, top, bottom, a, b };
  };
  test('上层轨道优先命中', () => {
    const { state, a } = build();
    expect(topmostItemAt(state, 0, 250, 250)?.id).toBe(a.id);
  });
  test('时间范围外不命中', () => {
    const { state, a, b } = build();
    expect(topmostItemAt(state, a.durationInFrames + 10, 250, 250)).toBeNull();
    void b;
  });
  test('隐藏轨道不命中，露出下层', () => {
    const { state, top, b } = build();
    state.tracks = [{ ...top, hidden: true }, state.tracks[1]];
    expect(topmostItemAt(state, 0, 250, 250)?.id).toBe(b.id);
  });
});

describe('resizeRect', () => {
  const start = { left: 0, top: 0, width: 200, height: 100 };
  test('se 角等比缩放', () => {
    const r = resizeRect(start, 'se', 100, 0, true);
    expect(r.width).toBe(300);
    expect(r.height).toBe(150); // 保持 2:1
    expect(r.left).toBe(0);
  });
  test('e 边单轴', () => {
    const r = resizeRect(start, 'e', 50, 999, false);
    expect(r.width).toBe(250);
    expect(r.height).toBe(100);
  });
  test('w 边移动 left 同时改宽度', () => {
    const r = resizeRect(start, 'w', 40, 0, false);
    expect(r.left).toBe(40);
    expect(r.width).toBe(160);
  });
  test('最小尺寸钳制 20', () => {
    const r = resizeRect(start, 'e', -500, 0, false);
    expect(r.width).toBe(20);
  });
});
