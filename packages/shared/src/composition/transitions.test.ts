import { describe, expect, it } from 'vitest';
import { createEmptyState, createSolidItem } from '../factories';
import type { Transition, UndoableState } from '../types';
import { getTransitionRenderProps } from './transitions';

// A: from 0 dur 60;B: from 45 dur 60(重叠 15,fade 15)
const mk = (): UndoableState => {
  const s = createEmptyState({ width: 100, height: 100 });
  const a = { ...createSolidItem({ trackId: 't', from: 0, width: 10, height: 10 }), id: 'A', durationInFrames: 60 };
  const b = { ...createSolidItem({ trackId: 't', from: 45, width: 10, height: 10 }), id: 'B', durationInFrames: 60 };
  const t: Transition = { id: 'x', trackId: 't', fromItemId: 'A', toItemId: 'B', type: 'fade', durationInFrames: 15 };
  return { ...s, items: { A: a, B: b }, transitions: { x: t } };
};

describe('getTransitionRenderProps', () => {
  it('无转场提前返回 1', () => {
    const s = createEmptyState({ width: 100, height: 100 });
    const it = createSolidItem({ trackId: 't', from: 0, width: 10, height: 10 });
    expect(getTransitionRenderProps({ ...s, items: { [it.id]: it } }, it, 0).opacity).toBe(1);
  });
  it('入场 B 在重叠 [45,60] 内 0→1', () => {
    const s = mk();
    expect(getTransitionRenderProps(s, s.items.B, 45).opacity).toBeCloseTo(0);
    expect(getTransitionRenderProps(s, s.items.B, 60).opacity).toBeCloseTo(1);
    expect(getTransitionRenderProps(s, s.items.B, 52.5).opacity).toBeCloseTo(0.5);
  });
  it('出场 A 在重叠 [45,60] 内 1→0', () => {
    const s = mk();
    expect(getTransitionRenderProps(s, s.items.A, 45).opacity).toBeCloseTo(1);
    expect(getTransitionRenderProps(s, s.items.A, 60).opacity).toBeCloseTo(0);
  });
  it('重叠区外为 1', () => {
    const s = mk();
    expect(getTransitionRenderProps(s, s.items.A, 10).opacity).toBe(1); // A 前段
    expect(getTransitionRenderProps(s, s.items.B, 100).opacity).toBe(1); // B 后段
  });
  it('live 自愈:B 右移到无重叠 → no-op(1)', () => {
    const s = mk();
    s.items.B = { ...s.items.B, from: 60 }; // 不再重叠
    expect(getTransitionRenderProps(s, s.items.B, 60).opacity).toBe(1);
  });
  it('mid-chain:B 既是某转场 to 又是另一转场 from → 淡入×淡出相乘', () => {
    const s = mk();
    const c = { ...createSolidItem({ trackId: 't', from: 105, width: 10, height: 10 }), id: 'C', durationInFrames: 60 };
    // B(45..105) 与 C 建第二个转场:C.from 左移到 90,重叠 [90,105] 15 帧
    s.items.C = { ...c, from: 90 };
    s.transitions.y = { id: 'y', trackId: 't', fromItemId: 'B', toItemId: 'C', type: 'fade', durationInFrames: 15 };
    // 在 B 的出场窗口中点附近,B 已淡入完成(=1)、正在淡出
    expect(getTransitionRenderProps(s, s.items.B, 97.5).opacity).toBeCloseTo(0.5);
  });
});
