import type React from 'react';
import { useRef, useState } from 'react';
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
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
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
} from '../components/ui/alert-dialog';
import { cn } from '../lib/utils';
import { useEditor, useEditorApi, useEditorDeps, useEditorRefs } from '../state/context';
import { importFiles } from '../lib/import-assets';
import { cleanupDeletedAssets } from '../lib/cleanup-assets';
import { downloadStateFile, loadStateFromFile, saveState } from '../persistence/persistence';

// 工具栏零件:全部 context-connected（自己从 Provider 取 store/deps/refs），放进 <EditorProvider>
// 里任意位置即用，无需 prop 对传功能函数。宿主用这些积木自拼工具栏；EditorRoot 也用它们拼默认工具栏。

/** 图标按钮:Tooltip 中文说明 */
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

/** 文件选择按钮:用 button + ref.click() 触发隐藏 input。
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

/** 工具栏容器:带 className 的 <header> 壳，children 由宿主填。 */
export const EditorToolbar: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <header
    className={cn('flex h-12 shrink-0 items-center gap-1.5 border-b border-zinc-800 px-4 text-sm', className)}
  >
    {children}
  </header>
);

/** 标题:不传 children 时回落 "Remotion Editor"。 */
export const EditorTitle: React.FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children,
}) => <span className={cn('mr-4 font-medium', className)}>{children ?? 'Remotion Editor'}</span>;

export const UndoButton: React.FC = () => {
  const canUndo = useEditor((s) => s.past.length > 0);
  const undo = useEditor((s) => s.undo);
  return (
    <IconButton label="撤销 (Cmd+Z)" disabled={!canUndo} onClick={undo}>
      <Undo2 />
    </IconButton>
  );
};

export const RedoButton: React.FC = () => {
  const canRedo = useEditor((s) => s.future.length > 0);
  const redo = useEditor((s) => s.redo);
  return (
    <IconButton label="重做 (Cmd+Y)" disabled={!canRedo} onClick={redo}>
      <Redo2 />
    </IconButton>
  );
};

export const PlayButton: React.FC = () => {
  const refs = useEditorRefs();
  return (
    <IconButton label="播放/暂停 (空格)" onClick={() => refs.player.current?.toggle()}>
      <Play />
    </IconButton>
  );
};

export const TextToolButton: React.FC = () => {
  const tool = useEditor((s) => s.canvasTool);
  const setTool = useEditor((s) => s.setCanvasTool);
  return (
    <Button
      variant={tool === 'text' ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => setTool(tool === 'text' ? null : 'text')}
      title="添加文本:点击画布放置（Esc 取消）"
      aria-pressed={tool === 'text'}
    >
      <Type />
      文本
    </Button>
  );
};

export const SolidToolButton: React.FC = () => {
  const tool = useEditor((s) => s.canvasTool);
  const setTool = useEditor((s) => s.setCanvasTool);
  return (
    <Button
      variant={tool === 'solid' ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => setTool(tool === 'solid' ? null : 'solid')}
      title="绘制色块:在画布上拖拽画框（Esc 取消）"
      aria-pressed={tool === 'solid'}
    >
      <Square />
      色块
    </Button>
  );
};

export const ImportAssetButton: React.FC = () => {
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const refs = useEditorRefs();
  return (
    <FileButton
      label="导入素材"
      icon={<Upload />}
      accept="video/*,audio/*,image/*"
      multiple
      onFiles={(files) => void importFiles(editorApi, deps, files, undefined, undefined, refs.getPlayerFrame())}
    />
  );
};

export const UploadStatusBadge: React.FC = () => {
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

export const CaptioningBadge: React.FC = () => {
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

/** 画布缩放控件:[适应图标(非 fit 时)] [−] [标签] [+]；相对步进（加倍/减半） */
export const ZoomControls: React.FC = () => {
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

export const SaveButton: React.FC = () => {
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

export const CleanupAssetsButton: React.FC = () => {
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
          <AlertDialogTitle>永久删除已移除的素材?</AlertDialogTitle>
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

/** 下载工程 .json（demo/本地流程；平台化宿主可不渲染） */
export const DownloadStateButton: React.FC = () => {
  const editorApi = useEditorApi();
  return (
    <Button variant="outline" size="sm" onClick={() => downloadStateFile(editorApi)} title="下载工程文件 (.json)">
      <Download />
      下载状态
    </Button>
  );
};

/** 从 .json 恢复工程（demo/本地流程；平台化宿主可不渲染） */
export const ImportStateButton: React.FC = () => {
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  return (
    <FileButton
      label="导入状态"
      icon={<FolderOpen />}
      accept=".json"
      title="从 .json 文件恢复工程"
      onFiles={(files) => void loadStateFromFile(editorApi, deps, files[0])}
    />
  );
};
