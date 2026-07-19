import { beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  createEmptyState,
  createSolidItem,
  createTrack,
} from '@editor/shared';
import { MAX_UNDO_STACK_SIZE } from '@editor/shared';
import { useEditorStore } from '../store';

const buildState = () => {
  const s = createEmptyState({
    width: DEFAULT_COMPOSITION_WIDTH,
    height: DEFAULT_COMPOSITION_HEIGHT,
  });
  const track = createTrack('T1');
  s.tracks = [track];
  const item = createSolidItem({ trackId: track.id, from: 0, width: 100, height: 100 });
  s.items = { [item.id]: item };
  return { s, item };
};

beforeEach(() => {
  const { s } = buildState();
  useEditorStore.setState({
    undoable: s,
    past: [],
    future: [],
    selectedItemIds: [],
  });
});

const store = () => useEditorStore.getState();

describe('undo/redo', () => {
  test('commit 更新推入 past、清空 future；undo 回滚、redo 重做', () => {
    const before = store().undoable;
    store().updateUndoable((s) => ({ ...s, fps: 60 }));
    expect(store().undoable.fps).toBe(60);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().undoable).toBe(before);
    expect(store().future).toHaveLength(1);
    store().redo();
    expect(store().undoable.fps).toBe(60);
  });

  test('updater 返回原引用 ⇒ 不入栈不变更', () => {
    store().updateUndoable((s) => s);
    expect(store().past).toHaveLength(0);
  });

  test('连续 commit:false + commitPending ⇒ 一条撤销记录', () => {
    const before = store().undoable;
    const id = Object.keys(before.items)[0];
    for (let i = 1; i <= 5; i++) {
      store().updateUndoable(
        (s) => ({ ...s, items: { ...s.items, [id]: { ...s.items[id], left: i * 10 } } }),
        { commit: false },
      );
    }
    expect(store().past).toHaveLength(0);
    store().commitPending();
    expect(store().past).toHaveLength(1);
    expect(store().undoable.items[id].left).toBe(50);
    store().undo();
    expect(store().undoable).toBe(before);
  });

  test('commitPending 无 pending 时为 no-op', () => {
    store().commitPending();
    expect(store().past).toHaveLength(0);
  });

  test('past 超上限丢弃最旧', () => {
    for (let i = 0; i < MAX_UNDO_STACK_SIZE + 10; i++) {
      store().updateUndoable((s) => ({ ...s, fps: s.fps + 1 }));
    }
    expect(store().past).toHaveLength(MAX_UNDO_STACK_SIZE);
  });

  test('deleteSelected 移除 items 并清空选中，一条撤销记录', () => {
    const id = Object.keys(store().undoable.items)[0];
    store().setSelected([id]);
    store().deleteSelected();
    expect(store().undoable.items[id]).toBeUndefined();
    expect(store().selectedItemIds).toEqual([]);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().undoable.items[id]).toBeDefined();
  });
});

describe('空轨道自动移除（官方行为，updateUndoable 统一兜底）', () => {
  test('删除轨道最后一个元素 ⇒ 多余空轨道移除；撤销还原', () => {
    // 第二条轨道带元素，第一条的元素删掉后其轨道应消失
    const t2 = createTrack('T2');
    const it2 = createSolidItem({ trackId: t2.id, from: 0, width: 50, height: 50 });
    store().updateUndoable((s) => ({
      ...s,
      tracks: [...s.tracks, t2],
      items: { ...s.items, [it2.id]: it2 },
    }));
    const first = Object.values(store().undoable.items).find((i) => i.id !== it2.id)!;
    useEditorStore.setState({ selectedItemIds: [first.id] });
    store().deleteSelected();
    expect(store().undoable.tracks.map((t) => t.id)).toEqual([t2.id]);
    store().undo();
    expect(store().undoable.tracks).toHaveLength(2);
    expect(store().undoable.items[first.id]).toBeDefined();
  });
  test('全部元素删光 ⇒ 保底留一条轨道', () => {
    const all = Object.keys(store().undoable.items);
    useEditorStore.setState({ selectedItemIds: all });
    store().deleteSelected();
    expect(Object.keys(store().undoable.items)).toHaveLength(0);
    expect(store().undoable.tracks).toHaveLength(1);
  });
});
