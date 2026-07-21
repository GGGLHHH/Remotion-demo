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
import { useT } from '../lib/i18n';
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
    className={cn('flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-4 text-sm', className)}
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
  const t = useT();
  const canUndo = useEditor((s) => s.past.length > 0);
  const undo = useEditor((s) => s.undo);
  return (
    <IconButton label={t('toolbar.undo')} disabled={!canUndo} onClick={undo}>
      <Undo2 />
    </IconButton>
  );
};

export const RedoButton: React.FC = () => {
  const t = useT();
  const canRedo = useEditor((s) => s.future.length > 0);
  const redo = useEditor((s) => s.redo);
  return (
    <IconButton label={t('toolbar.redo')} disabled={!canRedo} onClick={redo}>
      <Redo2 />
    </IconButton>
  );
};

export const PlayButton: React.FC = () => {
  const t = useT();
  const refs = useEditorRefs();
  return (
    <IconButton label={t('toolbar.playPause')} onClick={() => refs.player.current?.toggle()}>
      <Play />
    </IconButton>
  );
};

export const TextToolButton: React.FC = () => {
  const t = useT();
  const tool = useEditor((s) => s.canvasTool);
  const setTool = useEditor((s) => s.setCanvasTool);
  return (
    <Button
      variant={tool === 'text' ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => setTool(tool === 'text' ? null : 'text')}
      title={t('toolbar.textTool')}
      aria-pressed={tool === 'text'}
    >
      <Type />
      {t('toolbar.text')}
    </Button>
  );
};

export const SolidToolButton: React.FC = () => {
  const t = useT();
  const tool = useEditor((s) => s.canvasTool);
  const setTool = useEditor((s) => s.setCanvasTool);
  return (
    <Button
      variant={tool === 'solid' ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => setTool(tool === 'solid' ? null : 'solid')}
      title={t('toolbar.solidTool')}
      aria-pressed={tool === 'solid'}
    >
      <Square />
      {t('toolbar.solid')}
    </Button>
  );
};

export const ImportAssetButton: React.FC = () => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const refs = useEditorRefs();
  return (
    <FileButton
      label={t('toolbar.importAsset')}
      icon={<Upload />}
      accept="video/*,audio/*,image/*"
      multiple
      onFiles={(files) => void importFiles(editorApi, deps, files, undefined, undefined, refs.getPlayerFrame())}
    />
  );
};

export const UploadStatusBadge: React.FC = () => {
  const t = useT();
  const assetStatus = useEditor((s) => s.assetStatus);
  const uploading = Object.values(assetStatus).filter(
    (st) => st === 'in-progress' || st === 'pending-upload',
  ).length;
  const failed = Object.values(assetStatus).filter((st) => st === 'error').length;
  if (uploading === 0 && failed === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {uploading > 0 ? <Badge variant="secondary">{t('toolbar.uploading', { count: uploading })}</Badge> : null}
      {failed > 0 ? <Badge variant="destructive">{t('toolbar.uploadFailed', { count: failed })}</Badge> : null}
    </span>
  );
};

export const CaptioningBadge: React.FC = () => {
  const t = useT();
  const tasks = useEditor((s) => s.captioningTasks);
  const active = tasks.filter((task) => task.status === 'extracting' || task.status === 'transcribing').length;
  const failed = tasks.filter((task) => task.status === 'error').length;
  if (active === 0 && failed === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {active > 0 ? <Badge variant="secondary">{t('toolbar.captioning', { count: active })}</Badge> : null}
      {failed > 0 ? <Badge variant="destructive">{t('toolbar.captionFailed', { count: failed })}</Badge> : null}
    </span>
  );
};

/** 画布缩放控件:[适应图标(非 fit 时)] [−] [标签] [+]；相对步进（加倍/减半） */
export const ZoomControls: React.FC = () => {
  const t = useT();
  const refs = useEditorRefs();
  const canvasZoom = useEditor((s) => s.canvasZoom);
  const setCanvasZoom = useEditor((s) => s.setCanvasZoom);
  const effective = () => (canvasZoom === 'fit' ? refs.fitScale.current : canvasZoom);
  return (
    <span className="flex items-center gap-0.5">
      {canvasZoom !== 'fit' ? (
        <IconButton label={t('toolbar.fitCanvas')} onClick={() => setCanvasZoom('fit')}>
          <Maximize />
        </IconButton>
      ) : null}
      <IconButton label={t('toolbar.zoomOut')} onClick={() => setCanvasZoom(effective() / 2)}>
        <Minus />
      </IconButton>
      <span className="min-w-11 text-center text-xs tabular-nums text-muted-foreground">
        {canvasZoom === 'fit' ? t('toolbar.fit') : `${Math.round(canvasZoom * 100)}%`}
      </span>
      <IconButton label={t('toolbar.zoomIn')} onClick={() => setCanvasZoom(effective() * 2)}>
        <Plus />
      </IconButton>
    </span>
  );
};

export const SaveButton: React.FC = () => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const dirty = useEditor((s) => s.undoable !== s.lastSavedState);
  return (
    <Button
      variant="outline"
      size="sm"
      className={dirty ? 'border-amber-500/60 text-amber-400 hover:text-amber-300' : ''}
      onClick={() => saveState(editorApi, deps)}
      title={t('toolbar.save')}
    >
      <Save />
      {t('toolbar.saveLabel')}{dirty ? ' •' : ''}
    </Button>
  );
};

export const CleanupAssetsButton: React.FC = () => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const count = useEditor((s) => s.undoable.deletedAssets.length);
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 />
        {t('toolbar.cleanupAssets', { count })}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('toolbar.cleanupTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('toolbar.cleanupDesc', { count })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('toolbar.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              void cleanupDeletedAssets(editorApi, deps);
            }}
          >
            {t('toolbar.confirmDelete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/** 下载工程 .json（demo/本地流程；平台化宿主可不渲染） */
export const DownloadStateButton: React.FC = () => {
  const t = useT();
  const editorApi = useEditorApi();
  return (
    <Button variant="outline" size="sm" onClick={() => downloadStateFile(editorApi)} title={t('toolbar.downloadState')}>
      <Download />
      {t('toolbar.downloadStateLabel')}
    </Button>
  );
};

/** 从 .json 恢复工程（demo/本地流程；平台化宿主可不渲染） */
export const ImportStateButton: React.FC = () => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  return (
    <FileButton
      label={t('toolbar.importState')}
      icon={<FolderOpen />}
      accept=".json"
      title={t('toolbar.importStateTitle')}
      onFiles={(files) => void loadStateFromFile(editorApi, deps, files[0])}
    />
  );
};
