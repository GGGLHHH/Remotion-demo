import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  MAX_UNDO_STACK_SIZE,
  createEmptyState,
  type EditorStarterItem,
  type UndoableState,
} from '@gedatou/shared';
import { removeEmptyTracks } from '../../timeline/ops';
import type { EditorGet, EditorInitialState, EditorSet, EditorStore } from '../store';

const pushPast = (past: UndoableState[], snapshot: UndoableState): UndoableState[] => {
  const next = [...past, snapshot];
  return next.length > MAX_UNDO_STACK_SIZE ? next.slice(next.length - MAX_UNDO_STACK_SIZE) : next;
};

// 历史/撤销 slice:undoable + past/future + 撤销栈操作 + 样式预览。pendingBase(拖拽撤销基线)是本 slice
// 私有闭包变量——高频 commit:false 更新前的快照,不进 store 类型/不触发渲染,随实例隔离。所有读写它的
// action(updateUndoable/commitPending/undo/cancelItemStylePreview)都在此闭包内,不跨文件共享。
export const createHistorySlice = (
  set: EditorSet,
  get: EditorGet,
  init?: EditorInitialState,
): Pick<
  EditorStore,
  | 'undoable'
  | 'past'
  | 'future'
  | 'lastSavedState'
  | 'updateUndoable'
  | 'commitPending'
  | 'undo'
  | 'redo'
  | 'previewItemStyle'
  | 'cancelItemStylePreview'
> => {
  let pendingBase: UndoableState | null = null;

  return {
    // 宿主注入的初始态可能早于加法字段(如 transitions)→ 回填,保证 store 内 state 恒有该键
    undoable: init?.undoable
      ? { ...init.undoable, transitions: init.undoable.transitions ?? {}, groups: init.undoable.groups ?? {} }
      : createEmptyState({
          width: DEFAULT_COMPOSITION_WIDTH,
          height: DEFAULT_COMPOSITION_HEIGHT,
        }),
    past: [],
    future: [],
    lastSavedState: null,

    updateUndoable: (updater, opts) => {
      const { undoable, past } = get();
      // 官方行为:空轨道随任意变更自动移除(必经之路统一兜底,删除/剪切等路径不再单独处理)
      const next = removeEmptyTracks(updater(undoable));
      if (next === undoable) return;
      if (opts?.commit === false) {
        if (pendingBase === null) pendingBase = undoable;
        set({ undoable: next });
        return;
      }
      set({ undoable: next, past: pushPast(past, undoable), future: [] });
    },

    commitPending: () => {
      if (pendingBase === null) return;
      const base = pendingBase;
      pendingBase = null;
      const { past, undoable } = get();
      if (base === undoable) return; // 拖了个寂寞
      set({ past: pushPast(past, base), future: [] });
    },

    undo: () => {
      pendingBase = null;
      const { past, future, undoable } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ undoable: prev, past: past.slice(0, -1), future: [...future, undoable] });
    },

    redo: () => {
      const { past, future, undoable } = get();
      const next = future[future.length - 1];
      if (!next) return;
      set({ undoable: next, future: future.slice(0, -1), past: pushPast(past, undoable) });
    },

    previewItemStyle: (itemId, partial) =>
      get().updateUndoable(
        (s) => {
          const cur = s.items[itemId];
          if (!cur) return s;
          return { ...s, items: { ...s.items, [itemId]: { ...cur, ...partial } as EditorStarterItem } };
        },
        { commit: false },
      ),
    cancelItemStylePreview: () => {
      if (pendingBase === null) return;
      const base = pendingBase;
      pendingBase = null;
      set({ undoable: base });
    },
  };
};
