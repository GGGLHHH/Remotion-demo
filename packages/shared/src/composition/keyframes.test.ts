import { describe, expect, it } from 'vitest';
import { createSolidItem } from '../factories';
import { easingFn, keyframeAt, moveKeyframeInList, removeKeyframeAt, resolveProp, upsertKeyframe, withKeyframeList } from './keyframes';
import type { Keyframe } from '../types';

const kf = (frame: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe => ({ frame, value, easing });
const item = (kfs?: Record<string, Keyframe[]>) => ({ ...createSolidItem({ trackId: 't', from: 0, width: 100, height: 100 }), left: 10, opacity: 1, ...(kfs ? { keyframes: kfs } : {}) });

describe('easingFn', () => {
  it('linear 恒等,hold 为标记', () => {
    expect((easingFn('linear') as (t: number) => number)(0.5)).toBeCloseTo(0.5);
    expect(easingFn('hold')).toBe('hold');
  });
});

describe('resolveProp', () => {
  it('无关键帧回退静态值', () => {
    expect(resolveProp(item(), 'left', 5)).toBe(10);
  });
  it('单关键帧返回其值', () => {
    expect(resolveProp(item({ left: [kf(0, 99)] }), 'left', 3)).toBe(99);
  });
  it('段内线性插值', () => {
    const it = item({ left: [kf(0, 0), kf(10, 100)] });
    expect(resolveProp(it, 'left', 5)).toBeCloseTo(50);
  });
  it('边界外 clamp 到端点', () => {
    const it = item({ left: [kf(4, 20), kf(8, 60)] });
    expect(resolveProp(it, 'left', 0)).toBe(20);
    expect(resolveProp(it, 'left', 100)).toBe(60);
  });
  it('hold 出向关键帧到下一帧前阶跃', () => {
    const it = item({ left: [kf(0, 0, 'hold'), kf(10, 100)] });
    expect(resolveProp(it, 'left', 9)).toBe(0);
    expect(resolveProp(it, 'left', 10)).toBe(100);
  });
});

describe('list helpers', () => {
  it('upsert 保持升序、同帧覆盖', () => {
    let l = upsertKeyframe([], kf(10, 1));
    l = upsertKeyframe(l, kf(0, 2));
    l = upsertKeyframe(l, kf(10, 9)); // 覆盖 frame 10
    expect(l.map((k) => k.frame)).toEqual([0, 10]);
    expect(keyframeAt(l, 10)!.value).toBe(9);
  });
  it('removeAt 删指定帧', () => {
    expect(removeKeyframeAt([kf(0, 1), kf(5, 2)], 5).map((k) => k.frame)).toEqual([0]);
  });
  it('move 改帧并保持升序;撞帧覆盖', () => {
    const l = moveKeyframeInList([kf(0, 1), kf(5, 2)], 0, 8);
    expect(l.map((k) => k.frame)).toEqual([5, 8]);
  });
  it('withKeyframeList 空列表删属性、末属性清空则去 keyframes', () => {
    const withL = withKeyframeList(item(), 'left', [kf(0, 1)]);
    expect(withL.keyframes!.left).toHaveLength(1);
    const cleared = withKeyframeList(withL, 'left', []);
    expect(cleared.keyframes).toBeUndefined();
  });
});
