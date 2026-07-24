import { describe, expect, it } from 'vitest';
import type { Group } from '../types';
import {
  addItemToItemsGroup,
  expandSelectionWithGroups,
  findGroupOfItem,
  groupFromSelection,
  pruneGroups,
  regroupDuplicated,
  reorderGroup,
  ungroupBySelection,
} from '../groups';

const g = (id: string, itemIds: string[]): Group => ({ id, itemIds });
const map = (...groups: Group[]): Record<string, Group> => Object.fromEntries(groups.map((x) => [x.id, x]));

describe('findGroupOfItem', () => {
  it('返回成员所属组,无则 undefined', () => {
    const groups = map(g('G1', ['a', 'b']));
    expect(findGroupOfItem(groups, 'a')?.id).toBe('G1');
    expect(findGroupOfItem(groups, 'z')).toBeUndefined();
  });
});

describe('expandSelectionWithGroups', () => {
  it('任一成员被选 → 补全整组,去重保序', () => {
    const groups = map(g('G1', ['a', 'b', 'c']));
    expect(expandSelectionWithGroups(['b'], groups)).toEqual(['a', 'b', 'c']);
    expect(expandSelectionWithGroups(['a', 'b'], groups)).toEqual(['a', 'b', 'c']);
  });
  it('无组的 id 原样保留', () => {
    expect(expandSelectionWithGroups(['x', 'y'], {})).toEqual(['x', 'y']);
  });
  it('混合:自由项 + 组成员', () => {
    const groups = map(g('G1', ['a', 'b']));
    expect(expandSelectionWithGroups(['x', 'a'], groups)).toEqual(['x', 'a', 'b']);
  });
});

describe('pruneGroups', () => {
  it('摘除已删成员', () => {
    const groups = map(g('G1', ['a', 'b', 'c']));
    const out = pruneGroups(groups, new Set(['a', 'b']));
    expect(out.G1.itemIds).toEqual(['a', 'b']);
  });
  it('成员降到 <2 的组解散', () => {
    const groups = map(g('G1', ['a', 'b']));
    expect(pruneGroups(groups, new Set(['a'])).G1).toBeUndefined();
  });
  it('无变化返回原引用', () => {
    const groups = map(g('G1', ['a', 'b']));
    expect(pruneGroups(groups, new Set(['a', 'b', 'c']))).toBe(groups);
  });
});

describe('groupFromSelection', () => {
  it('≥2 建新组', () => {
    const r = groupFromSelection({}, ['a', 'b'], 'G1');
    expect(r?.groups.G1.itemIds).toEqual(['a', 'b']);
    expect(r?.groupId).toBe('G1');
  });
  it('<2(去重后)返回 null', () => {
    expect(groupFromSelection({}, ['a'], 'G1')).toBeNull();
    expect(groupFromSelection({}, ['a', 'a'], 'G1')).toBeNull();
  });
  it('成员从旧组摘出;旧组降到 <2 则解散(无嵌套)', () => {
    const groups = map(g('G0', ['a', 'b', 'c']));
    const r = groupFromSelection(groups, ['b', 'c'], 'G1');
    // G0 只剩 a → 解散;新组 G1 = [b,c]
    expect(r?.groups.G0).toBeUndefined();
    expect(r?.groups.G1.itemIds).toEqual(['b', 'c']);
  });
  it('旧组摘出后仍 ≥2 则保留', () => {
    const groups = map(g('G0', ['a', 'b', 'c', 'd']));
    const r = groupFromSelection(groups, ['c', 'd'], 'G1');
    expect(r?.groups.G0.itemIds).toEqual(['a', 'b']);
    expect(r?.groups.G1.itemIds).toEqual(['c', 'd']);
  });
});

describe('ungroupBySelection', () => {
  it('删除选中所涉及的组', () => {
    const groups = map(g('G1', ['a', 'b']), g('G2', ['c', 'd']));
    const out = ungroupBySelection(groups, ['a']);
    expect(out.G1).toBeUndefined();
    expect(out.G2.id).toBe('G2');
  });
  it('无涉及返回原引用', () => {
    const groups = map(g('G1', ['a', 'b']));
    expect(ungroupBySelection(groups, ['z'])).toBe(groups);
  });
});

describe('reorderGroup', () => {
  it('把匹配组的 itemIds 改成给定顺序', () => {
    const groups = map(g('G1', ['a', 'b', 'c']));
    expect(reorderGroup(groups, ['c', 'a', 'b']).G1.itemIds).toEqual(['c', 'a', 'b']);
  });
  it('顺序未变 → 原引用', () => {
    const groups = map(g('G1', ['a', 'b']));
    expect(reorderGroup(groups, ['a', 'b'])).toBe(groups);
  });
  it('成员集合不匹配任何组 → 原引用', () => {
    const groups = map(g('G1', ['a', 'b', 'c']));
    expect(reorderGroup(groups, ['a', 'b'])).toBe(groups); // 少了 c
    expect(reorderGroup(groups, ['a', 'b', 'x'])).toBe(groups); // x 不在组
  });
});

describe('addItemToItemsGroup', () => {
  it('把新半并入源 item 所属组', () => {
    const groups = map(g('G1', ['a', 'b']));
    expect(addItemToItemsGroup(groups, 'a', 'a2').G1.itemIds).toEqual(['a', 'b', 'a2']);
  });
  it('源无组 → 原样', () => {
    const groups = map(g('G1', ['a', 'b']));
    expect(addItemToItemsGroup(groups, 'z', 'z2')).toBe(groups);
  });
});

describe('regroupDuplicated', () => {
  const gid = (i: number) => `NG${i}`;
  it('源组的副本 ≥2 → 建新组(保成员映射)', () => {
    const groups = map(g('G1', ['a', 'b']));
    const out = regroupDuplicated(groups, { a: 'a2', b: 'b2' }, gid);
    expect(out.NG0.itemIds).toEqual(['a2', 'b2']);
  });
  it('多个源组各建各的新组', () => {
    const groups = map(g('G1', ['a', 'b']), g('G2', ['c', 'd']));
    const out = regroupDuplicated(groups, { a: 'a2', b: 'b2', c: 'c2', d: 'd2' }, gid);
    const built = Object.values(out).filter((x) => x.id.startsWith('NG'));
    expect(built).toHaveLength(2);
    expect(built.flatMap((x) => x.itemIds).sort()).toEqual(['a2', 'b2', 'c2', 'd2']);
  });
  it('组 + 自由项:只给组建新组,自由项副本不入组', () => {
    const groups = map(g('G1', ['a', 'b']));
    const out = regroupDuplicated(groups, { a: 'a2', b: 'b2', x: 'x2' }, gid);
    expect(out.NG0.itemIds).toEqual(['a2', 'b2']);
    expect(findGroupOfItem(out, 'x2')).toBeUndefined();
  });
  it('源不在任何组(跨标签页粘贴)→ 零新组', () => {
    expect(regroupDuplicated({}, { a: 'a2', b: 'b2' }, gid)).toEqual({});
  });
});
