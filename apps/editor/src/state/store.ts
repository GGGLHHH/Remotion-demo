import { create } from 'zustand';
import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  MAX_UNDO_STACK_SIZE,
  createEmptyState,
  type UndoableState,
} from '@editor/shared';

export type EditorStore = {
  undoable: UndoableState;
  past: UndoableState[]; // 最近的在末尾
  future: UndoableState[];
  selectedItemIds: string[];
  updateUndoable: (
    updater: (s: UndoableState) => UndoableState,
    opts?: { commit?: boolean },
  ) => void;
  commitPending: () => void;
  undo: () => void;
  redo: () => void;
  setSelected: (ids: string[]) => void;
  deleteSelected: () => void;
};

// 拖拽类高频操作的撤销基线：首次 commit:false 更新前的快照。
// 存放在 store 外部即可（不需要触发渲染）。
let pendingBase: UndoableState | null = null;

const pushPast = (past: UndoableState[], snapshot: UndoableState): UndoableState[] => {
  const next = [...past, snapshot];
  return next.length > MAX_UNDO_STACK_SIZE ? next.slice(next.length - MAX_UNDO_STACK_SIZE) : next;
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  undoable: createEmptyState({
    width: DEFAULT_COMPOSITION_WIDTH,
    height: DEFAULT_COMPOSITION_HEIGHT,
  }),
  past: [],
  future: [],
  selectedItemIds: [],

  updateUndoable: (updater, opts) => {
    const { undoable, past } = get();
    const next = updater(undoable);
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

  setSelected: (ids) => set({ selectedItemIds: ids }),

  deleteSelected: () => {
    const { selectedItemIds, updateUndoable } = get();
    if (selectedItemIds.length === 0) return;
    updateUndoable((s) => {
      const items = { ...s.items };
      for (const id of selectedItemIds) delete items[id];
      return { ...s, items };
    });
    set({ selectedItemIds: [] });
  },
}));
