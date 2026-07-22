import { describe, expect, it } from 'vitest';
import { createEmptyState, createSolidItem } from '../factories';
import type { Transition, UndoableState } from '../types';
import { getTransitionRenderProps, transitionVisual } from './transitions';

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

  it('合成:短中间片段同帧既入场又出场 → translate 相加(不被覆盖)', () => {
    // A[0,100]、B[80,100](dur20)、C[90,190];两转场窗口在 [90,100] 重叠(15+... > B.dur)
    const s = createEmptyState({ width: 100, height: 100 });
    const A = { ...createSolidItem({ trackId: 't', from: 0, width: 10, height: 10 }), id: 'A', durationInFrames: 100 };
    const B = { ...createSolidItem({ trackId: 't', from: 80, width: 10, height: 10 }), id: 'B', durationInFrames: 20 };
    const C = { ...createSolidItem({ trackId: 't', from: 90, width: 10, height: 10 }), id: 'C', durationInFrames: 100 };
    const x: Transition = { id: 'x', trackId: 't', fromItemId: 'A', toItemId: 'B', type: 'slide', direction: 'left', durationInFrames: 20 };
    const y: Transition = { id: 'y', trackId: 't', fromItemId: 'B', toItemId: 'C', type: 'slide', direction: 'up', durationInFrames: 10 };
    const state = { ...s, items: { A, B, C }, transitions: { x, y } };
    // frame 95:B 作为 x 入场(p=0.75 → tx=25)+ y 出场(p=0.5 → ty=-50);覆盖式实现会丢掉一个分量
    expect(getTransitionRenderProps(state, B, 95).translate).toBe('25% -50%');
  });
});

describe('transitionVisual', () => {
  it('fade: 仅 opacity(入场 p / 出场 1-p),无 translate/scale/clipPath —— 不回归 v1', () => {
    const vin = transitionVisual('fade', undefined, 'in', 0.5);
    expect(vin).toEqual({ opacity: 0.5 });
    expect(transitionVisual('fade', undefined, 'out', 0.5)).toEqual({ opacity: 0.5 });
    expect(transitionVisual('fade', undefined, 'in', 0).opacity).toBe(0);
    expect(transitionVisual('fade', undefined, 'out', 1).opacity).toBe(0);
  });

  it('slide: 入场从反侧滑到 0,出场被推向 direction 侧;到位(p=1)不留残余 translate', () => {
    // slide-left:新内容从右进入 → in 从 100%→0;旧内容推向左 → out 0→-100%
    expect(transitionVisual('slide', 'left', 'in', 0)).toEqual({ opacity: 1, translate: '100% 0%' });
    expect(transitionVisual('slide', 'left', 'in', 1)).toEqual({ opacity: 1 }); // 到位,无残余变换
    expect(transitionVisual('slide', 'left', 'out', 1)).toEqual({ opacity: 1, translate: '-100% 0%' });
    expect(transitionVisual('slide', 'right', 'out', 1)).toEqual({ opacity: 1, translate: '100% 0%' });
    expect(transitionVisual('slide', 'up', 'in', 0)).toEqual({ opacity: 1, translate: '0% 100%' });
    expect(transitionVisual('slide', 'down', 'out', 1)).toEqual({ opacity: 1, translate: '0% 100%' });
  });

  it('wipe: 入场 clipPath 从"运动反侧"揭开(与 slide 同向),出场不裁', () => {
    // wipe-left = 向左运动、新内容从右现身(与 slide-left 一致)
    expect(transitionVisual('wipe', 'left', 'in', 0)).toEqual({ opacity: 1, clipPath: 'inset(0 0 0 100%)' });
    expect(transitionVisual('wipe', 'left', 'in', 1)).toEqual({ opacity: 1, clipPath: 'inset(0 0 0 0%)' });
    expect(transitionVisual('wipe', 'right', 'in', 0)).toEqual({ opacity: 1, clipPath: 'inset(0 100% 0 0)' });
    expect(transitionVisual('wipe', 'up', 'in', 0)).toEqual({ opacity: 1, clipPath: 'inset(100% 0 0 0)' });
    expect(transitionVisual('wipe', 'down', 'in', 0)).toEqual({ opacity: 1, clipPath: 'inset(0 0 100% 0)' });
    expect(transitionVisual('wipe', 'left', 'out', 0.5)).toEqual({ opacity: 1 });
  });

  it('zoom: 入场 scale + 淡入,出场反向 scale + 淡出;到位(scale=1)不留残余', () => {
    expect(transitionVisual('zoom', 'in', 'in', 0)).toEqual({ opacity: 0, scale: '0.6' });
    expect(transitionVisual('zoom', 'in', 'in', 1)).toEqual({ opacity: 1 }); // scale 1 省略
    expect(transitionVisual('zoom', 'in', 'out', 0)).toEqual({ opacity: 1 }); // scale 1 省略
    expect(transitionVisual('zoom', 'in', 'out', 1)).toEqual({ opacity: 0, scale: '1.2' });
    expect(transitionVisual('zoom', 'out', 'in', 0)).toEqual({ opacity: 0, scale: '1.2' });
    expect(transitionVisual('zoom', 'out', 'in', 1)).toEqual({ opacity: 1 }); // scale 1 省略
  });
});
