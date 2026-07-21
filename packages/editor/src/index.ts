// @gedatou/editor 公开 API。
// 一站式：<EditorRoot deps=… />；或用 <EditorProvider> + `Editor.*` 零件（工具栏按钮 / 容器 /
// Canvas / Timeline / Inspector / PlaybackBar）shadcn-compound 式自拼布局。

// Provider / store / refs / hooks
export { EditorProvider, useEditor, useEditorApi, useEditorRefs, useEditorDeps } from './state/context';
export { createEditorStore } from './state/store';
export { createInstanceRefs } from './state/instance-refs';

// 一站式根组件（batteries-included preset）
export { EditorRoot } from './EditorRoot';
export type { EditorRootProps } from './EditorRoot';

// 单面板 + 外壳行为（命令式 / 自定义外壳用）
export { useShortcuts } from './shortcuts/useShortcuts';
export { EditorContainer, useEditorChrome } from './shell/container';
// tooltip 的共享 provider（不用 Container、自绘外壳的宿主可手动包一层；用 Container 则已内含）
export { TooltipProvider } from './components/ui/tooltip';

// 扁平别名（向后兼容:0.3 起的既有导出）
import { CanvasView } from './canvas/CanvasView';
import { Inspector } from './inspector/Inspector';
import { TimelinePanel } from './timeline/TimelinePanel';
import { PlaybackBar } from './playback/PlaybackBar';
export { CanvasView as Canvas, Inspector, TimelinePanel as Timeline, PlaybackBar };
export type { CanvasTool } from './state/store';

// shadcn-compound 零件:全部 context-connected，放进 <EditorProvider> 里摆放即用。
// 想改工具栏/布局的照 EditorRoot 那棵树用这些零件重拼即可。
import { EditorContainer } from './shell/container';
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
  // 布局
  Container: EditorContainer,
  Toolbar: EditorToolbar,
  Title: EditorTitle,
  Canvas: CanvasView,
  Inspector,
  Timeline: TimelinePanel,
  PlaybackBar,
  // 工具栏按钮
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
  // 状态徽章
  UploadStatusBadge,
  CaptioningBadge,
};

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

// i18n：库不做 i18n，只暴露注入缝（EditorDeps.t / EditorT）+ 内置 zh 默认（也是完整 key 目录）。
// 消费方拿 zhMessages 当翻译基线/key 清单，注入自己的 t 即可让编辑器跟随宿主语言。
export { zhMessages } from './locales/zh';

// 类型
export type { EditorStore, EditorStoreApi, EditorInitialState } from './state/store';
export type { EditorInstanceRefs } from './state/instance-refs';
export type { EditorTransport, EditorStorage, NotifyFn, EditorDeps, EditorT, RenderProgress } from './state/runtime';
