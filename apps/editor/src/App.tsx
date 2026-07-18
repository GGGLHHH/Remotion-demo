import { useEffect, useRef, useState } from 'react';
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

/** 文件选择按钮：用 button + ref.click() 触发隐藏 input。
 * 不用 <label> 包 hidden input——Safari 不会把 label 点击转发给 display:none 的表单控件。 */
const FileButton: React.FC<{
  label: string;
  accept: string;
  multiple?: boolean;
  title?: string;
  onFiles: (files: File[]) => void;
}> = ({ label, accept, multiple, title, onFiles }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
        title={title}
        onClick={() => ref.current?.click()}
      >
        {label}
      </button>
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
    <span className="text-xs text-zinc-400">
      {uploading > 0 ? `上传中 ${uploading}…` : null}
      {failed > 0 ? <span className="text-red-400"> 失败 {failed}</span> : null}
    </span>
  );
};

const CaptioningBadge = () => {
  const tasks = useEditorStore((s) => s.captioningTasks);
  const active = tasks.filter((t) => t.status === 'extracting' || t.status === 'transcribing').length;
  const failed = tasks.filter((t) => t.status === 'error').length;
  if (active === 0 && failed === 0) return null;
  return (
    <span className="text-xs text-zinc-400">
      {active > 0 ? `转录中 ${active}…` : null}
      {failed > 0 ? <span className="text-red-400"> 转录失败 {failed}</span> : null}
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
    <button
      className={`rounded border px-2 py-1 text-xs ${
        dirty
          ? 'border-amber-500 text-amber-400 hover:bg-zinc-800'
          : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
      }`}
      onClick={saveState}
      title="保存 (Cmd+S)"
    >
      保存{dirty ? ' •' : ''}
    </button>
  );
};

const CleanupAssetsButton = () => {
  const count = useEditorStore((s) => s.undoable.deletedAssets.length);
  if (count === 0) return null;
  return (
    <button
      className="rounded border border-red-800 px-2 py-1 text-xs text-red-400 hover:bg-zinc-800"
      onClick={() => {
        if (confirm(`永久删除 ${count} 个已移除的素材？此操作会清空撤销历史，不可恢复。`)) {
          void cleanupDeletedAssets();
        }
      }}
    >
      清理素材({count})
    </button>
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
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 px-4 text-sm">
        <span className="mr-4 font-medium">Remotion Editor</span>
        <button
          className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-30"
          disabled={!canUndo}
          onClick={undo}
          title="撤销 (Cmd+Z)"
        >
          ↩
        </button>
        <button
          className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-30"
          disabled={!canRedo}
          onClick={redo}
          title="重做 (Cmd+Y)"
        >
          ↪
        </button>
        <button
          className="rounded px-2 py-1 hover:bg-zinc-800"
          onClick={() => playerRef.current?.toggle()}
          title="播放/暂停 (空格)"
        >
          ⏯
        </button>
        <button
          className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
          onClick={addTextItem}
          title="添加文本"
        >
          T 文本
        </button>
        <button
          className={`rounded border px-2 py-1 text-xs ${
            drawSolidMode
              ? 'border-blue-500 bg-blue-500/20 text-blue-300'
              : 'border-zinc-700 hover:bg-zinc-800'
          }`}
          onClick={() => setDrawSolidMode((v) => !v)}
          title="绘制色块：在画布上拖拽画框（Esc 取消）"
          aria-pressed={drawSolidMode}
        >
          ■ 色块
        </button>
        <FileButton
          label="导入素材"
          accept="video/*,audio/*,image/*"
          multiple
          onFiles={(files) => void importFiles(files)}
        />
        <UploadStatusBadge />
        <CaptioningBadge />
        <div className="ml-auto flex items-center gap-2">
          <CleanupAssetsButton />
          <SaveButton />
          <button
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
            onClick={downloadStateFile}
            title="下载工程文件 (.json)"
          >
            下载状态
          </button>
          <FileButton
            label="导入状态"
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
