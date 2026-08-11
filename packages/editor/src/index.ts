// @gedatou/editor 公开 API。
// 主用法（headless 核心）：<EditorProvider> + useEditor/useEditorCommands + 交互面组件（Canvas/
// Timeline/Inspector/PlaybackBar）自建 UI。可选 batteries-included：<EditorRoot> 或 Editor.* chrome 零件。

// ── headless 核心（主 API）─────────────────────────────────────────────
// 用 EditorProvider 提供 store/refs/deps，用 useEditor(selector) 读响应式状态、
// useEditorCommands() 取一套绑好的命令，配合交互面组件自建任意 UI。
// 交互面组件（headless 核心：画布拖拽/缩放/裁剪、时间线 trim/吸附/框选、检查器字段）。均接受 className。
import { CanvasView } from './canvas/CanvasView'
import { Inspector } from './inspector/Inspector'
import { PlaybackBar } from './playback/PlaybackBar'
// Editor.* chrome 零件（context-connected，摆放即用）。只含 chrome —— 工具栏容器/标题/按钮/徽章；
// 交互面用上方扁平的 Canvas/Timeline/Inspector/PlaybackBar，外壳用 EditorContainer。
import {
  CaptioningBadge,
  CaptionsToolButton,
  CleanupAssetsButton,
  DownloadStateButton,
  EditorTitle,
  EditorToolbar,
  ImportAssetButton,
  ImportStateButton,
  PlayButton,
  RedoButton,
  SaveButton,
  SolidToolButton,
  TextToolButton,
  UndoButton,
  UploadStatusBadge,
  ZoomControls,
} from './shell/toolbar'

import { TimelinePanel } from './timeline/TimelinePanel'

export { TooltipProvider } from './components/ui/tooltip'
// ── 可选：batteries-included ───────────────────────────────────────────
// 一站式 preset。
export { EditorRoot } from './EditorRoot'
export type { EditorRootProps } from './EditorRoot'
export { ColorField, FadeSliders, Row, Section, SliderField } from './inspector/fields'
// 检查器积木:section 命名空间 + 补丁 hook + 字段原语,供宿主自拼面板
export { InspectorSections, type PatchFn, useItemPatch } from './inspector/Inspector'
export { CanvasView as Canvas, Inspector, PlaybackBar, TimelinePanel as Timeline }
export { KeyframeToggle } from './inspector/KeyframeToggle'
export { NumberField } from './inspector/NumberField'
export { type ItemKeyframesApi, useItemKeyframes } from './inspector/use-item-keyframes'
export { addCaptionsItem } from './lib/add-items'
export { generateCaptions } from './lib/captioning'
export { cleanupDeletedAssets } from './lib/cleanup-assets'

export { useEditorCommands } from './lib/commands'
export type { EditorCommands } from './lib/commands'
// 命令式操作（非 React / 高级用法；useEditorCommands 是它们的 React 便捷封装）。
export { importFiles } from './lib/import-assets'

export {
  applyAnimationPreset,
  clearKeyframes,
  moveKeyframe,
  moveKeyframesAtFrame,
  setKeyframeEasing,
  setKeyframeValue,
  toggleKeyframe,
} from './lib/keyframe-ops'
export { startRender } from './lib/render-client'

export const Editor = {
  Toolbar: EditorToolbar,
  Title: EditorTitle,
  UndoButton,
  RedoButton,
  PlayButton,
  TextToolButton,
  SolidToolButton,
  CaptionsToolButton,
  ImportAssetButton,
  ZoomControls,
  SaveButton,
  CleanupAssetsButton,
  DownloadStateButton,
  ImportStateButton,
  UploadStatusBadge,
  CaptioningBadge,
}

export { parseSubtitles, serializeSubtitles } from './lib/subtitle-io'
export { addTransition, applyTransitionDuration, applyTransitionPreset, removeTransition } from './lib/transition-ops'
// i18n：库不做 i18n，只暴露注入缝（EditorDeps.t / EditorT）+ 内置 en 默认（也是完整 key 目录）。
export { enMessages } from './locales/en'
export {
  deserializeState,
  downloadStateFile,
  loadStateFromFile,
  restoreLocalUrls,
  saveState,
  serializeState,
} from './persistence/persistence'
// 外壳行为（自绘外壳用）：容器 + 快捷键/拦刷新钩子 + tooltip provider。
export { EditorContainer, useEditorChrome } from './shell/container'
export { useShortcuts } from './shortcuts/useShortcuts'
export { EditorProvider, useEditor, useEditorApi, useEditorDeps, useEditorRefs } from './state/context'
export { createInstanceRefs } from './state/instance-refs'
export type { EditorInstanceRefs } from './state/instance-refs'
export type { EditorDeps, EditorStorage, EditorT, EditorTransport, NotifyFn, RenderProgress } from './state/runtime'
export { createEditorStore } from './state/store'
export type { CanvasTool } from './state/store'

// 类型
export type { EditorInitialState, EditorStore, EditorStoreApi } from './state/store'

export type { AnimatableProp, Keyframe, KeyframeEasing } from '@gedatou/shared'
export type { Transition, TransitionType } from '@gedatou/shared'
export type { PresetId } from '@gedatou/shared/composition'
