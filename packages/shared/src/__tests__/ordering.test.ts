import { describe, expect, test } from 'vitest';
import { createEmptyState, createSolidItem, createTrack } from '../factories';
import { getOrderedItems } from '../composition/ordering';

describe('getOrderedItems', () => {
  test('底部轨道的 item 排在前（先画在下层）', () => {
    const state = createEmptyState({ width: 1080, height: 1920 });
    const top = createTrack('Track 1');
    const bottom = createTrack('Track 2');
    state.tracks = [top, bottom]; // index 0 = 最上层
    const a = createSolidItem({ trackId: top.id, from: 0, width: 10, height: 10 });
    const b = createSolidItem({ trackId: bottom.id, from: 0, width: 10, height: 10 });
    state.items = { [a.id]: a, [b.id]: b };
    const ordered = getOrderedItems(state);
    expect(ordered.map((i) => i.id)).toEqual([b.id, a.id]);
  });
  test('隐藏轨道的 item 不返回', () => {
    const state = createEmptyState({ width: 1080, height: 1920 });
    const t = { ...createTrack('T'), hidden: true };
    state.tracks = [t];
    const a = createSolidItem({ trackId: t.id, from: 0, width: 10, height: 10 });
    state.items = { [a.id]: a };
    expect(getOrderedItems(state)).toEqual([]);
  });
  test('同轨内按 from 升序：后开始者排在后面（画在上层，供转场叠加）', () => {
    const state = createEmptyState({ width: 1080, height: 1920 });
    const t = createTrack('T');
    state.tracks = [t];
    const later = createSolidItem({ trackId: t.id, from: 5, width: 10, height: 10 });
    const earlier = createSolidItem({ trackId: t.id, from: 0, width: 10, height: 10 });
    // 故意按 from 5 在前、from 0 在后的顺序塞进 items map，验证排序不依赖插入顺序
    state.items = { [later.id]: later, [earlier.id]: earlier };
    const ordered = getOrderedItems(state);
    expect(ordered.map((i) => i.id)).toEqual([earlier.id, later.id]);
  });
});
