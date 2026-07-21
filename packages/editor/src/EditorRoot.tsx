import { EditorProvider } from './state/context';
import { TooltipProvider } from './components/ui/tooltip';
import type { EditorDeps } from './state/runtime';
import type { EditorInitialState, EditorStoreApi } from './state/store';
import type { EditorInstanceRefs } from './state/instance-refs';
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
import { CanvasView } from './canvas/CanvasView';
import { Inspector } from './inspector/Inspector';
import { TimelinePanel } from './timeline/TimelinePanel';
import { PlaybackBar } from './playback/PlaybackBar';

export type EditorRootProps = {
  /** I/O 依赖注入:transport（后端）/ storage（持久化）/ notify（提示）。必填。 */
  deps: EditorDeps;
  /** 受控 store（宿主自持/暴露句柄）；不传则 Provider 按 initialState 自建 */
  store?: EditorStoreApi;
  /** 受控 refs 袋子（宿主暴露 player 等）；不传则 Provider 自建 */
  refs?: EditorInstanceRefs;
  /** 初始工程状态（非受控 store 时的播种） */
  initialState?: EditorInitialState;
  /** 内嵌模式:用 h-full 填满父容器（默认 h-screen 占满视口，适合独立整页） */
  fill?: boolean;
};

/**
 * 一站式编辑器根组件（batteries-included preset）:自带 <EditorProvider>（store/refs/deps 隔离）+
 * TooltipProvider，用公开零件（EditorContainer / EditorToolbar / 各按钮 / Canvas / Inspector /
 * PlaybackBar / Timeline）拼出默认布局。放进去 + 传 deps 即可运行，一页可多个。
 * 想改工具栏/布局的:照这棵树自己用同样的零件（见 `Editor` 命名空间导出）重拼即可。
 */
export function EditorRoot({ deps, store, refs, initialState, fill }: EditorRootProps) {
  return (
    <EditorProvider deps={deps} store={store} refs={refs} initialState={initialState}>
      <TooltipProvider>
        <EditorContainer fill={fill}>
          <EditorToolbar>
            <EditorTitle />
            <UndoButton />
            <RedoButton />
            <PlayButton />
            <TextToolButton />
            <SolidToolButton />
            <ImportAssetButton />
            <UploadStatusBadge />
            <CaptioningBadge />
            <div className="ml-auto flex items-center gap-1.5">
              <ZoomControls />
              <CleanupAssetsButton />
              <SaveButton />
              <DownloadStateButton />
              <ImportStateButton />
            </div>
          </EditorToolbar>
          <div className="flex min-h-0 flex-1">
            <CanvasView />
            <aside className="w-[349px] shrink-0 overflow-y-auto border-l border-zinc-800 text-sm">
              <Inspector />
            </aside>
          </div>
          <PlaybackBar />
          <TimelinePanel />
        </EditorContainer>
      </TooltipProvider>
    </EditorProvider>
  );
}
