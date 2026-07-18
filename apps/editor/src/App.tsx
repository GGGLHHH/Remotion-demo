import { useEffect, useRef, useState } from 'react';
import {
  Download,
  FolderOpen,
  Play,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
} from '@/components/ui/alert-dialog';
import { useEditorStore } from './state/store';
import { useShortcuts } from './shortcuts/useShortcuts';
import { CanvasView } from './canvas/CanvasView';
import { playerRef } from './canvas/player-ref';
import { Inspector } from './inspector/Inspector';
import { TimelinePanel } from './timeline/TimelinePanel';
import { PlaybackBar } from './playback/PlaybackBar';
import { importFiles } from './lib/import-assets';
import { addTextItem } from './lib/add-items';
import { cleanupDeletedAssets } from './lib/cleanup-assets';
import {
  downloadStateFile,
  loadStateFromFile,
  resolveInitialState,
  restoreLocalUrls,
  saveState,
} from './persistence/persistence';
import { buildDemoState } from './demo-state';

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
  const assetStatus = useEditorStore((s) => s.assetStatus);
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
  const tasks = useEditorStore((s) => s.captioningTasks);
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

// 初始状态：URL hash > localStorage > demo；启动即视为"已保存"
const initialState = resolveInitialState() ?? buildDemoState();
useEditorStore.setState({ undoable: initialState, lastSavedState: initialState });
void restoreLocalUrls(initialState);

// e2e 测试用（仅开发构建）
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__editorStore = useEditorStore;
  (window as unknown as Record<string, unknown>).__playerRef = playerRef;
}

const SaveButton = () => {
  const dirty = useEditorStore((s) => s.undoable !== s.lastSavedState);
  return (
    <Button
      variant="outline"
      size="sm"
      className={dirty ? 'border-amber-500/60 text-amber-400 hover:text-amber-300' : ''}
      onClick={saveState}
      title="保存 (Cmd+S)"
    >
      <Save />
      保存{dirty ? ' •' : ''}
    </Button>
  );
};

const CleanupAssetsButton = () => {
  const count = useEditorStore((s) => s.undoable.deletedAssets.length);
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
              void cleanupDeletedAssets();
            }}
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default function App() {
  useShortcuts();
  // 绘制色块模式（瞬时 UI 状态，不进 store）
  const [drawSolidMode, setDrawSolidMode] = useState(false);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const hasActiveUploads = useEditorStore((s) =>
    Object.values(s.assetStatus).some((st) => st === 'pending-upload' || st === 'in-progress'),
  );
  const hasActiveRenders = useEditorStore((s) =>
    s.renderingTasks.some((t) => t.status === 'queued' || t.status === 'rendering'),
  );
  const hasActiveCaptioning = useEditorStore((s) =>
    s.captioningTasks.some((t) => t.status === 'extracting' || t.status === 'transcribing'),
  );

  // Escape 退出绘制色块模式
  useEffect(() => {
    if (!drawSolidMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawSolidMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawSolidMode]);

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
        <IconButton label="播放/暂停 (空格)" onClick={() => playerRef.current?.toggle()}>
          <Play />
        </IconButton>
        <Button variant="outline" size="sm" onClick={addTextItem} title="添加文本">
          <Type />
          文本
        </Button>
        <Button
          variant={drawSolidMode ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setDrawSolidMode((v) => !v)}
          title="绘制色块：在画布上拖拽画框（Esc 取消）"
          aria-pressed={drawSolidMode}
        >
          <Square />
          色块
        </Button>
        <FileButton
          label="导入素材"
          icon={<Upload />}
          accept="video/*,audio/*,image/*"
          multiple
          onFiles={(files) => void importFiles(files)}
        />
        <UploadStatusBadge />
        <CaptioningBadge />
        <div className="ml-auto flex items-center gap-1.5">
          <CleanupAssetsButton />
          <SaveButton />
          <Button variant="outline" size="sm" onClick={downloadStateFile} title="下载工程文件 (.json)">
            <Download />
            下载状态
          </Button>
          <FileButton
            label="导入状态"
            icon={<FolderOpen />}
            accept=".json"
            title="从 .json 文件恢复工程"
            onFiles={(files) => void loadStateFromFile(files[0])}
          />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <CanvasView drawSolidMode={drawSolidMode} onExitDrawSolid={() => setDrawSolidMode(false)} />
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-zinc-800 text-sm">
          <Inspector />
        </aside>
      </div>
      <PlaybackBar />
      <TimelinePanel />
    </div>
  );
}
