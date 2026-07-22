import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  MAX_UNDO_STACK_SIZE,
  createEmptyState,
  type AssetStatus,
  type EditorStarterItem,
  type UndoableState,
} from '@gedatou/shared';
import { removeEmptyTracks } from '../timeline/ops';

/** 画布工具模式：绘制色块 / 点击放置文本。原 EditorShell 本地 state，移入 store
 *  供拆分后的工具栏按钮与画布各自订阅（context-connected，无需 prop 对传）。 */
export type CanvasTool = 'solid' | 'text' | null;

export type RenderingTask = {
  id: string;
  status: 'queued' | 'rendering' | 'done' | 'error';
  progress: number; // 0-1
  url?: string;
  error?: string;
  codec: string;
  /** 服务端生成的下载文件名（渲染完成才有，见 RenderProgress.fileName） */
  fileName?: string;
};

export type CaptioningTask = {
  id: string;
  itemId: string;
  status: 'extracting' | 'transcribing' | 'done' | 'error';
  error?: string;
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
  /** 画布工具模式（瞬时 UI 态） */
  canvasTool: CanvasTool;
  setCanvasTool: (tool: CanvasTool) => void;
  /** 时间轴缩放（px/帧）；'fit' = 自动适配可视宽度（官方滑杆 0 位） */
  timelineZoom: number | 'fit';
  setTimelineZoom: (zoom: number | 'fit') => void;
  /** 时间轴面板高度（px） */
  timelineHeight: number;
  setTimelineHeight: (h: number) => void;
  snappingEnabled: boolean;
  toggleSnapping: () => void;
  /** 素材上传状态（瞬时） */
  assetStatus: Record<string, AssetStatus>;
  setAssetStatus: (assetId: string, status: AssetStatus) => void;
  /** 上传进度 0-100（瞬时，完成后清除） */
  uploadProgress: Record<string, number>;
  setUploadProgress: (assetId: string, pct: number | null) => void;
  /** 本地 blob URL（预览优先用） */
  localUrls: Record<string, string>;
  setLocalUrl: (assetId: string, url: string) => void;
  /** 画布行内编辑中的文本项 */
  textItemEditing: string | null;
  setTextItemEditing: (id: string | null) => void;
  /** 裁剪模式中的项 */
  itemSelectedForCrop: string | null;
  setItemSelectedForCrop: (id: string | null) => void;
  /** 选中的转场（瞬时 UI 态，与 selectedItemIds 互斥） */
  selectedTransitionId: string | null;
  setSelectedTransition: (id: string | null) => void;
  /** 字体悬停预览 */
  fontHoverPreview: { itemId: string; fontFamily: string } | null;
  setFontHoverPreview: (v: { itemId: string; fontFamily: string } | null) => void;
  /** 样式悬停预览：commit:false 直接改 item（画布实时可见），点击时 commitPending 提交 */
  previewItemStyle: (itemId: string, partial: Partial<EditorStarterItem>) => void;
  /** 取消样式预览：还原到预览前快照，不进撤销栈 */
  cancelItemStylePreview: () => void;
  /** 内部剪贴板 */
  clipboard: EditorStarterItem[];
  setClipboard: (items: EditorStarterItem[]) => void;
  /** 最近保存的快照（脏标记用） */
  lastSavedState: UndoableState | null;
  /** 渲染任务（瞬时，随服务端任务表一起丢失） */
  renderingTasks: RenderingTask[];
  upsertRenderingTask: (task: RenderingTask) => void;
  /** 字幕转录任务（瞬时） */
  captioningTasks: CaptioningTask[];
  upsertCaptioningTask: (task: CaptioningTask) => void;
  loop: boolean;
  toggleLoop: () => void;
  playerMuted: boolean;
  togglePlayerMuted: () => void;
};

const pushPast = (past: UndoableState[], snapshot: UndoableState): UndoableState[] => {
  const next = [...past, snapshot];
  return next.length > MAX_UNDO_STACK_SIZE ? next.slice(next.length - MAX_UNDO_STACK_SIZE) : next;
};

/** vanilla store 句柄类型：非 React 模块收此参、组件经 useEditorApi() 取得 */
export type EditorStoreApi = StoreApi<EditorStore>;

/** 建 store 时的可选初始态（demo / 宿主播种） */
export type EditorInitialState = { undoable?: UndoableState };

/**
 * 每实例 store 工厂：替代原全局单例。pendingBase（拖拽撤销基线）移入闭包随实例隔离——
 * 一页多个编辑器互不串台，宿主可注入初始态、SSR 不在 import 期建 store。
 */
export function createEditorStore(init?: EditorInitialState): EditorStoreApi {
  // 拖拽类高频操作的撤销基线：首次 commit:false 更新前的快照（每实例私有，不触发渲染）
  let pendingBase: UndoableState | null = null;

  return createStore<EditorStore>((set, get) => ({
  undoable:
    init?.undoable ??
    createEmptyState({
      width: DEFAULT_COMPOSITION_WIDTH,
      height: DEFAULT_COMPOSITION_HEIGHT,
    }),
  past: [],
  future: [],
  selectedItemIds: [],
  selectedTransitionId: null,

  updateUndoable: (updater, opts) => {
    const { undoable, past } = get();
    // 官方行为：空轨道随任意变更自动移除（必经之路统一兜底，删除/剪切等路径不再单独处理）
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

  setSelected: (ids) => set({ selectedItemIds: ids, selectedTransitionId: null }),

  canvasZoom: 'fit',
  setCanvasZoom: (zoom) =>
    set({ canvasZoom: zoom === 'fit' ? zoom : Math.min(4, Math.max(0.1, zoom)) }),
  canvasTool: null,
  setCanvasTool: (tool) => set({ canvasTool: tool }),

  timelineZoom: 'fit',
  setTimelineZoom: (zoom) =>
    set({ timelineZoom: zoom === 'fit' ? zoom : Math.min(8, Math.max(0.1, zoom)) }),
  timelineHeight: 224,
  setTimelineHeight: (h) => set({ timelineHeight: Math.min(500, Math.max(120, h)) }),
  snappingEnabled: true,
  toggleSnapping: () => set((s) => ({ snappingEnabled: !s.snappingEnabled })),
  assetStatus: {},
  setAssetStatus: (assetId, status) =>
    set((s) => ({ assetStatus: { ...s.assetStatus, [assetId]: status } })),
  uploadProgress: {},
  setUploadProgress: (assetId, pct) =>
    set((s) => {
      if (pct === null) {
        const { [assetId]: _removed, ...rest } = s.uploadProgress;
        return { uploadProgress: rest };
      }
      return { uploadProgress: { ...s.uploadProgress, [assetId]: pct } };
    }),
  localUrls: {},
  setLocalUrl: (assetId, url) => set((s) => ({ localUrls: { ...s.localUrls, [assetId]: url } })),
  textItemEditing: null,
  setTextItemEditing: (id) => set({ textItemEditing: id }),
  itemSelectedForCrop: null,
  setItemSelectedForCrop: (id) => set({ itemSelectedForCrop: id }),
  setSelectedTransition: (id) => set({ selectedTransitionId: id, selectedItemIds: [] }),
  fontHoverPreview: null,
  setFontHoverPreview: (v) => set({ fontHoverPreview: v }),
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
  captioningTasks: [],
  upsertCaptioningTask: (task) =>
    set((s) => {
      const i = s.captioningTasks.findIndex((t) => t.id === task.id);
      if (i === -1) return { captioningTasks: [...s.captioningTasks, task] };
      const next = [...s.captioningTasks];
      next[i] = task;
      return { captioningTasks: next };
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
      // 孤儿清理：引用了被删 item 的转场一并删除（渲染端不容忍 dangling id）
      const transitions = Object.fromEntries(
        Object.entries(s.transitions).filter(
          ([, t]) => !selectedItemIds.includes(t.fromItemId) && !selectedItemIds.includes(t.toItemId),
        ),
      );
      return { ...s, items, deletedAssets, transitions };
    });
    set({ selectedItemIds: [] });
  },
  }));
}
