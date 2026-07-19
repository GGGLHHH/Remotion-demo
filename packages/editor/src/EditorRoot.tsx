import { useEffect, useRef, useState } from 'react';
import {
  Download,
  FolderOpen,
  Maximize,
  Minus,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './components/ui/alert-dialog';
import {
  EditorProvider,
  useEditor,
  useEditorApi,
  useEditorDeps,
  useEditorRefs,
} from './state/context';
import { TooltipProvider } from './components/ui/tooltip';
import type { EditorDeps } from './state/runtime';
import type { EditorInitialState, EditorStoreApi } from './state/store';
import type { EditorInstanceRefs } from './state/instance-refs';
import { useShortcuts } from './shortcuts/useShortcuts';
import { CanvasView, type CanvasTool } from './canvas/CanvasView';
import { Inspector } from './inspector/Inspector';
import { TimelinePanel } from './timeline/TimelinePanel';
import { PlaybackBar } from './playback/PlaybackBar';
import { importFiles } from './lib/import-assets';
import { cleanupDeletedAssets } from './lib/cleanup-assets';
import { downloadStateFile, loadStateFromFile, saveState } from './persistence/persistence';

/** 图标按钮：Tooltip 中文说明 */
const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick} />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

/** 文件选择按钮：用 button + ref.click() 触发隐藏 input。
 * 不用 <label> 包 hidden input——Safari 不会把 label 点击转发给 display:none 的表单控件。 */
const FileButton: React.FC<{
  label: string;
  accept: string;
  multiple?: boolean;
  title?: string;
  icon?: React.ReactNode;
  onFiles: (files: File[]) => void;
}> = ({ label, accept, multiple, title, icon, onFiles }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="outline" size="sm" title={title} onClick={() => ref.current?.click()}>
        {icon}
        {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
};

const UploadStatusBadge = () => {
  const assetStatus = useEditor((s) => s.assetStatus);
  const uploading = Object.values(assetStatus).filter(
    (st) => st === 'in-progress' || st === 'pending-upload',
  ).length;
  const failed = Object.values(assetStatus).filter((st) => st === 'error').length;
  if (uploading === 0 && failed === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {uploading > 0 ? <Badge variant="secondary">上传中 {uploading}…</Badge> : null}
      {failed > 0 ? <Badge variant="destructive">失败 {failed}</Badge> : null}
    </span>
  );
};

const CaptioningBadge = () => {
  const tasks = useEditor((s) => s.captioningTasks);
  const active = tasks.filter((t) => t.status === 'extracting' || t.status === 'transcribing').length;
  const failed = tasks.filter((t) => t.status === 'error').length;
  if (active === 0 && failed === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {active > 0 ? <Badge variant="secondary">转录中 {active}…</Badge> : null}
      {failed > 0 ? <Badge variant="destructive">转录失败 {failed}</Badge> : null}
    </span>
  );
};

/** 画布缩放控件：[适应图标(非 fit 时)] [−] [标签] [+]；相对步进（加倍/减半） */
const ZoomControls = () => {
  const refs = useEditorRefs();
  const canvasZoom = useEditor((s) => s.canvasZoom);
  const setCanvasZoom = useEditor((s) => s.setCanvasZoom);
  const effective = () => (canvasZoom === 'fit' ? refs.fitScale.current : canvasZoom);
  return (
    <span className="flex items-center gap-0.5">
      {canvasZoom !== 'fit' ? (
        <IconButton label="适应画布 (0)" onClick={() => setCanvasZoom('fit')}>
          <Maximize />
        </IconButton>
      ) : null}
      <IconButton label="缩小 (-)" onClick={() => setCanvasZoom(effective() / 2)}>
        <Minus />
      </IconButton>
      <span className="min-w-11 text-center text-xs tabular-nums text-zinc-300">
        {canvasZoom === 'fit' ? '适应' : `${Math.round(canvasZoom * 100)}%`}
      </span>
      <IconButton label="放大 (+)" onClick={() => setCanvasZoom(effective() * 2)}>
        <Plus />
      </IconButton>
    </span>
  );
};

const SaveButton = () => {
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const dirty = useEditor((s) => s.undoable !== s.lastSavedState);
  return (
    <Button
      variant="outline"
      size="sm"
      className={dirty ? 'border-amber-500/60 text-amber-400 hover:text-amber-300' : ''}
      onClick={() => saveState(editorApi, deps)}
      title="保存 (Cmd+S)"
    >
      <Save />
      保存{dirty ? ' •' : ''}
    </Button>
  );
};

const CleanupAssetsButton = () => {
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const count = useEditor((s) => s.undoable.deletedAssets.length);
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 />
        清理素材({count})
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>永久删除已移除的素材？</AlertDialogTitle>
          <AlertDialogDescription>
            将永久删除 {count} 个已移除素材的远端对象与本地缓存，并清空撤销历史。此操作不可恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              void cleanupDeletedAssets(editorApi, deps);
            }}
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

function EditorShell() {
  useShortcuts();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const refs = useEditorRefs();
  // 画布工具模式：绘制色块 / 点击放置文本（瞬时 UI 状态，不进 store）
  const [tool, setTool] = useState<CanvasTool>(null);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const hasActiveUploads = useEditor((s) =>
    Object.values(s.assetStatus).some((st) => st === 'pending-upload' || st === 'in-progress'),
  );
  const hasActiveRenders = useEditor((s) =>
    s.renderingTasks.some((t) => t.status === 'queued' || t.status === 'rendering'),
  );
  const hasActiveCaptioning = useEditor((s) =>
    s.captioningTasks.some((t) => t.status === 'extracting' || t.status === 'transcribing'),
  );

  // Escape 退出画布工具模式
  useEffect(() => {
    if (!tool) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTool(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool]);

  // 上传/渲染/转录未完成时拦截关闭/刷新，避免丢素材或丢进度
  useEffect(() => {
    if (!hasActiveUploads && !hasActiveRenders && !hasActiveCaptioning) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasActiveUploads, hasActiveRenders, hasActiveCaptioning]);

  return (
    <div className="flex h-screen flex-col bg-zinc-900 text-zinc-100">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-zinc-800 px-4 text-sm">
        <span className="mr-4 font-medium">Remotion Editor</span>
        <IconButton label="撤销 (Cmd+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 />
        </IconButton>
        <IconButton label="重做 (Cmd+Y)" disabled={!canRedo} onClick={redo}>
          <Redo2 />
        </IconButton>
        <IconButton label="播放/暂停 (空格)" onClick={() => refs.player.current?.toggle()}>
          <Play />
        </IconButton>
        <Button
          variant={tool === 'text' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setTool((t) => (t === 'text' ? null : 'text'))}
          title="添加文本：点击画布放置（Esc 取消）"
          aria-pressed={tool === 'text'}
        >
          <Type />
          文本
        </Button>
        <Button
          variant={tool === 'solid' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setTool((t) => (t === 'solid' ? null : 'solid'))}
          title="绘制色块：在画布上拖拽画框（Esc 取消）"
          aria-pressed={tool === 'solid'}
        >
          <Square />
          色块
        </Button>
        <FileButton
          label="导入素材"
          icon={<Upload />}
          accept="video/*,audio/*,image/*"
          multiple
          onFiles={(files) => void importFiles(editorApi, deps, files, undefined, undefined, refs.getPlayerFrame())}
        />
        <UploadStatusBadge />
        <CaptioningBadge />
        <div className="ml-auto flex items-center gap-1.5">
          <ZoomControls />
          <CleanupAssetsButton />
          <SaveButton />
          <Button variant="outline" size="sm" onClick={() => downloadStateFile(editorApi)} title="下载工程文件 (.json)">
            <Download />
            下载状态
          </Button>
          <FileButton
            label="导入状态"
            icon={<FolderOpen />}
            accept=".json"
            title="从 .json 文件恢复工程"
            onFiles={(files) => void loadStateFromFile(editorApi, deps, files[0])}
          />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <CanvasView tool={tool} onExitTool={() => setTool(null)} />
        <aside className="w-[349px] shrink-0 overflow-y-auto border-l border-zinc-800 text-sm">
          <Inspector />
        </aside>
      </div>
      <PlaybackBar />
      <TimelinePanel />
    </div>
  );
}

export type EditorRootProps = {
  /** I/O 依赖注入：transport（后端）/ storage（持久化）/ notify（提示）。必填。 */
  deps: EditorDeps;
  /** 受控 store（宿主自持/暴露句柄）；不传则 Provider 按 initialState 自建 */
  store?: EditorStoreApi;
  /** 受控 refs 袋子（宿主暴露 player 等）；不传则 Provider 自建 */
  refs?: EditorInstanceRefs;
  /** 初始工程状态（非受控 store 时的播种） */
  initialState?: EditorInitialState;
};

/**
 * 一站式编辑器根组件：自带 <EditorProvider>（store/refs/deps 隔离）+ TooltipProvider，
 * 内部装配工具栏 + 画布 + 检查器 + 播放条 + 时间线。放进去 + 传 deps 即可运行，一页可多个。
 * 想自定义布局的用 <EditorProvider> + 单面板（Canvas/Timeline/Inspector/PlaybackBar）。
 */
export function EditorRoot({ deps, store, refs, initialState }: EditorRootProps) {
  return (
    <EditorProvider deps={deps} store={store} refs={refs} initialState={initialState}>
      <TooltipProvider>
        <EditorShell />
      </TooltipProvider>
    </EditorProvider>
  );
}
