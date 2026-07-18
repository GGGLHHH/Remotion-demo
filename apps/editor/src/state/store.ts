import { create } from 'zustand';
import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  MAX_UNDO_STACK_SIZE,
  createEmptyState,
  type AssetStatus,
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
  /** 画布缩放：'fit' 表示适配容器 */
  canvasZoom: number | 'fit';
  setCanvasZoom: (zoom: number | 'fit') => void;
  /** 时间轴缩放（px/帧） */
  timelineZoom: number;
  setTimelineZoom: (zoom: number) => void;
  /** 时间轴面板高度（px） */
  timelineHeight: number;
  setTimelineHeight: (h: number) => void;
  snappingEnabled: boolean;
  toggleSnapping: () => void;
  /** 素材上传状态（瞬时） */
  assetStatus: Record<string, AssetStatus>;
  setAssetStatus: (assetId: string, status: AssetStatus) => void;
  /** 本地 blob URL（预览优先用） */
  localUrls: Record<string, string>;
  setLocalUrl: (assetId: string, url: string) => void;
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

  canvasZoom: 'fit',
  setCanvasZoom: (zoom) =>
    set({ canvasZoom: zoom === 'fit' ? zoom : Math.min(4, Math.max(0.1, zoom)) }),

  timelineZoom: 2,
  setTimelineZoom: (zoom) => set({ timelineZoom: Math.min(8, Math.max(0.1, zoom)) }),
  timelineHeight: 224,
  setTimelineHeight: (h) => set({ timelineHeight: Math.min(500, Math.max(120, h)) }),
  snappingEnabled: true,
  toggleSnapping: () => set((s) => ({ snappingEnabled: !s.snappingEnabled })),
  assetStatus: {},
  setAssetStatus: (assetId, status) =>
    set((s) => ({ assetStatus: { ...s.assetStatus, [assetId]: status } })),
  localUrls: {},
  setLocalUrl: (assetId, url) => set((s) => ({ localUrls: { ...s.localUrls, [assetId]: url } })),

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
