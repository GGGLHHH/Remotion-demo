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
