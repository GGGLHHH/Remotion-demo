import { useEffect } from 'react';
import { useEditorStore } from './state/store';
import { useShortcuts } from './shortcuts/useShortcuts';
import { CanvasView } from './canvas/CanvasView';
import { playerRef } from './canvas/player-ref';
import { Inspector } from './inspector/Inspector';
import { TimelinePanel } from './timeline/TimelinePanel';
import { PlaybackBar } from './playback/PlaybackBar';
import { importFiles } from './lib/import-assets';
import { addSolidItem, addTextItem } from './lib/add-items';
import { cleanupDeletedAssets } from './lib/cleanup-assets';
import {
  downloadStateFile,
  loadStateFromFile,
  resolveInitialState,
  restoreLocalUrls,
  saveState,
} from './persistence/persistence';
import { buildDemoState } from './demo-state';

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
          className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
          onClick={addSolidItem}
          title="添加色块"
        >
          ■ 色块
        </button>
        <label className="cursor-pointer rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">
          导入素材
          <input
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void importFiles(files);
            }}
          />
        </label>
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
          <label
            className="cursor-pointer rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
            title="从 .json 文件恢复工程"
          >
            导入状态
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void loadStateFromFile(file);
              }}
            />
          </label>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <CanvasView />
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-zinc-800 text-sm">
          <Inspector />
        </aside>
      </div>
      <PlaybackBar />
      <TimelinePanel />
    </div>
  );
}
