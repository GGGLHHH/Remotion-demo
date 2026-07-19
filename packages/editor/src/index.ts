// @gedatou/editor 公开 API。
// 一站式：<EditorRoot deps=… />；或用 <EditorProvider> + 单面板（Canvas/Timeline/Inspector/PlaybackBar）自定义布局。

// Provider / store / refs / hooks
export { EditorProvider, useEditor, useEditorApi, useEditorRefs, useEditorDeps } from './state/context';
export { createEditorStore } from './state/store';
export { createInstanceRefs } from './state/instance-refs';

// 一站式根组件 + 单面板积木
export { EditorRoot } from './EditorRoot';
export type { EditorRootProps } from './EditorRoot';
export { CanvasView as Canvas } from './canvas/CanvasView';
export { TimelinePanel as Timeline } from './timeline/TimelinePanel';
export { Inspector } from './inspector/Inspector';
export { PlaybackBar } from './playback/PlaybackBar';
export { useShortcuts } from './shortcuts/useShortcuts';

// 命令式操作（自定义外壳 / 高级用法）
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

// 类型
export type { EditorStore, EditorStoreApi, EditorInitialState } from './state/store';
export type { EditorInstanceRefs } from './state/instance-refs';
export type { EditorTransport, EditorStorage, NotifyFn, EditorDeps, RenderProgress } from './state/runtime';
