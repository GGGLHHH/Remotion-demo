import { beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  createEmptyState,
  createSolidItem,
  createTrack,
  findGroupOfItem,
} from '@gedatou/shared';
import { createEditorStore, type EditorStoreApi } from '../store';

// 三个各自独占轨道的色块(可跨轨道成组)
const buildState = () => {
  const s = createEmptyState({ width: DEFAULT_COMPOSITION_WIDTH, height: DEFAULT_COMPOSITION_HEIGHT });
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const track = createTrack(`T${i}`);
    s.tracks.push(track);
    const item = createSolidItem({ trackId: track.id, from: 0, width: 100, height: 100 });
    s.items[item.id] = item;
    ids.push(item.id);
  }
  return { s, ids };
};

let api: EditorStoreApi;
let ids: string[];

beforeEach(() => {
  api = createEditorStore();
  const built = buildState();
  ids = built.ids;
  api.setState({ undoable: built.s, past: [], future: [], selectedItemIds: [] });
});

const store = () => api.getState();

describe('分组 store 集成', () => {
  test('groupSelected:选中 ≥2 建组;<2 不建', () => {
    store().setSelected([ids[0]]);
    store().groupSelected();
    expect(Object.keys(store().undoable.groups)).toHaveLength(0);

    store().setSelected([ids[0], ids[1]]);
    store().groupSelected();
    const groups = Object.values(store().undoable.groups);
    expect(groups).toHaveLength(1);
    expect(groups[0].itemIds.sort()).toEqual([ids[0], ids[1]].sort());
  });

  test('setSelected 单点收口:点组内一个成员 → 整组选中', () => {
    store().setSelected([ids[0], ids[1]]);
    store().groupSelected();
    store().setSelected([ids[1]]); // 只点一个成员
    expect(store().selectedItemIds.sort()).toEqual([ids[0], ids[1]].sort());
  });

  test('deleteSelected:删一个成员 → 组降到 <2 自动解散', () => {
    store().setSelected([ids[0], ids[1]]);
    store().groupSelected();
    // 直接删单个成员(绕过整组展开:手动设选中再删,验证 prune)
    api.setState({ selectedItemIds: [ids[0]] });
    store().deleteSelected();
    expect(Object.keys(store().undoable.groups)).toHaveLength(0);
  });

  test('ungroupSelected:拆分选中所涉及的组', () => {
    store().setSelected([ids[0], ids[1]]);
    store().groupSelected();
    store().setSelected([ids[0]]); // 展开成整组
    store().ungroupSelected();
    expect(Object.keys(store().undoable.groups)).toHaveLength(0);
    expect(findGroupOfItem(store().undoable.groups, ids[0])).toBeUndefined();
  });

  test('分组进撤销栈:undo 还原组', () => {
    store().setSelected([ids[0], ids[1]]);
    store().groupSelected();
    expect(Object.keys(store().undoable.groups)).toHaveLength(1);
    store().undo();
    expect(Object.keys(store().undoable.groups)).toHaveLength(0);
    store().redo();
    expect(Object.keys(store().undoable.groups)).toHaveLength(1);
  });
});
