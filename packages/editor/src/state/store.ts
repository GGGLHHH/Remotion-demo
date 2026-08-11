import type { AssetStatus, EditorStarterItem, UndoableState } from '@gedatou/shared'
import type { StoreApi } from 'zustand/vanilla'
import { createStore } from 'zustand/vanilla'
import { createHistorySlice } from './slices/history-slice'
import { createIoSlice } from './slices/io-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createViewSlice } from './slices/view-slice'

/**
 * 画布工具模式：绘制色块 / 点击放置文本。原 EditorShell 本地 state，移入 store
 *  供拆分后的工具栏按钮与画布各自订阅（context-connected，无需 prop 对传）。
 */
export type CanvasTool = 'solid' | 'text' | null

export interface RenderingTask {
  id: string
  status: 'queued' | 'rendering' | 'done' | 'error'
  progress: number // 0-1
  url?: string
  error?: string
  codec: string
  /** 服务端生成的下载文件名（渲染完成才有，见 RenderProgress.fileName） */
  fileName?: string
}

export interface CaptioningTask {
  id: string
  itemId: string
  status: 'extracting' | 'transcribing' | 'done' | 'error'
  error?: string
}

export interface EditorStore {
  undoable: UndoableState
  past: UndoableState[] // 最近的在末尾
  future: UndoableState[]
  selectedItemIds: string[]
  updateUndoable: (
    updater: (s: UndoableState) => UndoableState,
    opts?: { commit?: boolean },
  ) => void
  commitPending: () => void
  undo: () => void
  redo: () => void
  setSelected: (ids: string[]) => void
  deleteSelected: () => void
  /** 把当前选中(去重后 ≥2)组合成一个持久组;成员从旧组摘出(不嵌套) */
  groupSelected: () => void
  /** 拆分当前选中所涉及的所有组 */
  ungroupSelected: () => void
  /** 把"成员集合 === orderedItemIds"的组的 itemIds 重排为该顺序(序列顺序持久化,进撤销/存档) */
  reorderGroupItems: (orderedItemIds: string[]) => void
  /** 画布缩放：'fit' 表示适配容器 */
  canvasZoom: number | 'fit'
  setCanvasZoom: (zoom: number | 'fit') => void
  /** 画布工具模式（瞬时 UI 态） */
  canvasTool: CanvasTool
  setCanvasTool: (tool: CanvasTool) => void
  /** 时间轴缩放（px/帧）；'fit' = 自动适配可视宽度（官方滑杆 0 位） */
  timelineZoom: number | 'fit'
  setTimelineZoom: (zoom: number | 'fit') => void
  /** 时间轴面板高度（px） */
  timelineHeight: number
  setTimelineHeight: (h: number) => void
  snappingEnabled: boolean
  toggleSnapping: () => void
  /** 素材上传状态（瞬时） */
  assetStatus: Record<string, AssetStatus>
  setAssetStatus: (assetId: string, status: AssetStatus) => void
  /** 上传进度 0-100（瞬时，完成后清除） */
  uploadProgress: Record<string, number>
  setUploadProgress: (assetId: string, pct: number | null) => void
  /** 本地 blob URL（预览优先用） */
  localUrls: Record<string, string>
  setLocalUrl: (assetId: string, url: string) => void
  /** 画布行内编辑中的文本项 */
  textItemEditing: string | null
  setTextItemEditing: (id: string | null) => void
  /** 裁剪模式中的项 */
  itemSelectedForCrop: string | null
  setItemSelectedForCrop: (id: string | null) => void
  /** 选中的转场（瞬时 UI 态，与 selectedItemIds 互斥） */
  selectedTransitionId: string | null
  setSelectedTransition: (id: string | null) => void
  /** 字体悬停预览 */
  fontHoverPreview: { itemId: string, fontFamily: string } | null
  setFontHoverPreview: (v: { itemId: string, fontFamily: string } | null) => void
  /** 样式悬停预览：commit:false 直接改 item（画布实时可见），点击时 commitPending 提交 */
  previewItemStyle: (itemId: string, partial: Partial<EditorStarterItem>) => void
  /** 取消样式预览：还原到预览前快照，不进撤销栈 */
  cancelItemStylePreview: () => void
  /** 内部剪贴板 */
  clipboard: EditorStarterItem[]
  setClipboard: (items: EditorStarterItem[]) => void
  /** 最近保存的快照（脏标记用） */
  lastSavedState: UndoableState | null
  /** 渲染任务（瞬时，随服务端任务表一起丢失） */
  renderingTasks: RenderingTask[]
  upsertRenderingTask: (task: RenderingTask) => void
  /** 字幕转录任务（瞬时） */
  captioningTasks: CaptioningTask[]
  upsertCaptioningTask: (task: CaptioningTask) => void
  loop: boolean
  toggleLoop: () => void
  playerMuted: boolean
  togglePlayerMuted: () => void
}

/** vanilla store 句柄类型：非 React 模块收此参、组件经 useEditorApi() 取得 */
export type EditorStoreApi = StoreApi<EditorStore>

/** slice 工厂的 set/get 类型（各 slice 文件从此 type-only import,避免与本文件的值依赖成环） */
export type EditorSet = EditorStoreApi['setState']
export type EditorGet = EditorStoreApi['getState']

/** 建 store 时的可选初始态（demo / 宿主播种） */
export interface EditorInitialState { undoable?: UndoableState }

/**
 * 每实例 store 工厂：替代原全局单例。按域拆成 4 个 slice 工厂组合（history/selection/view/io）——
 * 一页多个编辑器互不串台，宿主可注入初始态、SSR 不在 import 期建 store。
 * pendingBase（拖拽撤销基线）随实例隔离在 history slice 的闭包里（见 history-slice）。
 */
export function createEditorStore(init?: EditorInitialState): EditorStoreApi {
  return createStore<EditorStore>((set, get) => ({
    ...createHistorySlice(set, get, init),
    ...createSelectionSlice(set, get),
    ...createViewSlice(set),
    ...createIoSlice(set),
  }))
}
