import { create } from 'zustand';
import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  MAX_UNDO_STACK_SIZE,
  createEmptyState,
  type AssetStatus,
  type EditorStarterItem,
  type UndoableState,
} from '@editor/shared';

export type RenderingTask = {
  id: string;
  status: 'queued' | 'rendering' | 'done' | 'error';
  progress: number; // 0-1
  url?: string;
  error?: string;
  codec: string;
};

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
  /** 画布行内编辑中的文本项 */
  textItemEditing: string | null;
  setTextItemEditing: (id: string | null) => void;
  /** 裁剪模式中的项 */
  itemSelectedForCrop: string | null;
  setItemSelectedForCrop: (id: string | null) => void;
  /** 字体悬停预览 */
  fontHoverPreview: { itemId: string; fontFamily: string } | null;
  setFontHoverPreview: (v: { itemId: string; fontFamily: string } | null) => void;
  /** 内部剪贴板 */
  clipboard: EditorStarterItem[];
  setClipboard: (items: EditorStarterItem[]) => void;
  /** 最近保存的快照（脏标记用） */
  lastSavedState: UndoableState | null;
  /** 渲染任务（瞬时，随服务端任务表一起丢失） */
  renderingTasks: RenderingTask[];
  upsertRenderingTask: (task: RenderingTask) => void;
  loop: boolean;
  toggleLoop: () => void;
  playerMuted: boolean;
  togglePlayerMuted: () => void;
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
  textItemEditing: null,
  setTextItemEditing: (id) => set({ textItemEditing: id }),
  itemSelectedForCrop: null,
  setItemSelectedForCrop: (id) => set({ itemSelectedForCrop: id }),
  fontHoverPreview: null,
  setFontHoverPreview: (v) => set({ fontHoverPreview: v }),
  clipboard: [],
  setClipboard: (items) => set({ clipboard: items }),
  lastSavedState: null,
  renderingTasks: [],
  upsertRenderingTask: (task) =>
    set((s) => {
      const i = s.renderingTasks.findIndex((t) => t.id === task.id);
      if (i === -1) return { renderingTasks: [...s.renderingTasks, task] };
      const next = [...s.renderingTasks];
      next[i] = task;
      return { renderingTasks: next };
    }),
  loop: true,
  toggleLoop: () => set((s) => ({ loop: !s.loop })),
  playerMuted: false,
  togglePlayerMuted: () => set((s) => ({ playerMuted: !s.playerMuted })),

  deleteSelected: () => {
    const { selectedItemIds, updateUndoable } = get();
    if (selectedItemIds.length === 0) return;
    updateUndoable((s) => {
      const items = { ...s.items };
      for (const id of selectedItemIds) delete items[id];
      // 不再被引用的素材进入两阶段删除（清理时才真正删远端/缓存）
      const referenced = new Set(
        Object.values(items)
          .map((i) => ('assetId' in i ? i.assetId : null))
          .filter(Boolean),
      );
      const already = new Set(s.deletedAssets.map((d) => d.assetId));
      const deletedAssets = [...s.deletedAssets];
      for (const assetId of Object.keys(s.assets)) {
        if (!referenced.has(assetId) && !already.has(assetId)) {
          deletedAssets.push({ assetId, deletedAt: Date.now() });
        }
      }
      return { ...s, items, deletedAssets };
    });
    set({ selectedItemIds: [] });
  },
}));
