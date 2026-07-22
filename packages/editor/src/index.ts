// @gedatou/editor 公开 API。
// 主用法（headless 核心）：<EditorProvider> + useEditor/useEditorCommands + 交互面组件（Canvas/
// Timeline/Inspector/PlaybackBar）自建 UI。可选 batteries-included：<EditorRoot> 或 Editor.* chrome 零件。

// ── headless 核心（主 API）─────────────────────────────────────────────
// 用 EditorProvider 提供 store/refs/deps，用 useEditor(selector) 读响应式状态、
// useEditorCommands() 取一套绑好的命令，配合交互面组件自建任意 UI。
export { EditorProvider, useEditor, useEditorApi, useEditorRefs, useEditorDeps } from './state/context';
export { createEditorStore } from './state/store';
export { createInstanceRefs } from './state/instance-refs';
export { useEditorCommands } from './lib/commands';
export type { EditorCommands } from './lib/commands';

// 交互面组件（headless 核心：画布拖拽/缩放/裁剪、时间线 trim/吸附/框选、检查器字段）。均接受 className。
import { CanvasView } from './canvas/CanvasView';
import { Inspector } from './inspector/Inspector';
import { TimelinePanel } from './timeline/TimelinePanel';
import { PlaybackBar } from './playback/PlaybackBar';
export { CanvasView as Canvas, Inspector, TimelinePanel as Timeline, PlaybackBar };
// 检查器积木:section 命名空间 + 补丁 hook + 字段原语,供宿主自拼面板
export { InspectorSections, useItemPatch, type PatchFn } from './inspector/Inspector';
export { Section, Row, ColorField, SliderField, FadeSliders } from './inspector/fields';
export { NumberField } from './inspector/NumberField';
export type { CanvasTool } from './state/store';

// 外壳行为（自绘外壳用）：容器 + 快捷键/拦刷新钩子 + tooltip provider。
export { EditorContainer, useEditorChrome } from './shell/container';
export { useShortcuts } from './shortcuts/useShortcuts';
export { TooltipProvider } from './components/ui/tooltip';

// ── 可选：batteries-included ───────────────────────────────────────────
// 一站式 preset。
export { EditorRoot } from './EditorRoot';
export type { EditorRootProps } from './EditorRoot';

// Editor.* chrome 零件（context-connected，摆放即用）。只含 chrome —— 工具栏容器/标题/按钮/徽章；
// 交互面用上方扁平的 Canvas/Timeline/Inspector/PlaybackBar，外壳用 EditorContainer。
import {
  CaptioningBadge,
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
} from './shell/toolbar';

export const Editor = {
  Toolbar: EditorToolbar,
  Title: EditorTitle,
  UndoButton,
  RedoButton,
  PlayButton,
  TextToolButton,
  SolidToolButton,
  ImportAssetButton,
  ZoomControls,
  SaveButton,
  CleanupAssetsButton,
  DownloadStateButton,
  ImportStateButton,
  UploadStatusBadge,
  CaptioningBadge,
};

// 命令式操作（非 React / 高级用法；useEditorCommands 是它们的 React 便捷封装）。
export { importFiles } from './lib/import-assets';
export { startRender } from './lib/render-client';
export { generateCaptions } from './lib/captioning';
export { cleanupDeletedAssets } from './lib/cleanup-assets';
export {
  saveState,
  loadStateFromFile,
  downloadStateFile,
  restoreLocalUrls,
  serializeState,
  deserializeState,
} from './persistence/persistence';

// i18n：库不做 i18n，只暴露注入缝（EditorDeps.t / EditorT）+ 内置 en 默认（也是完整 key 目录）。
export { enMessages } from './locales/en';

// 类型
export type { EditorStore, EditorStoreApi, EditorInitialState } from './state/store';
export type { EditorInstanceRefs } from './state/instance-refs';
export type { EditorTransport, EditorStorage, NotifyFn, EditorDeps, EditorT, RenderProgress } from './state/runtime';
