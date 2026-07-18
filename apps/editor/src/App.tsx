import { useEditorStore } from './state/store';
import { useShortcuts } from './shortcuts/useShortcuts';
import { CanvasView } from './canvas/CanvasView';
import { playerRef } from './canvas/player-ref';
import { Inspector } from './inspector/Inspector';
import { TimelinePanel } from './timeline/TimelinePanel';
import { importFiles } from './lib/import-assets';
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

// 初始状态（M5 持久化后改为 loadState() ?? demo）
useEditorStore.setState({ undoable: buildDemoState() });

// e2e 测试用（仅开发构建）
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__editorStore = useEditorStore;
}

export default function App() {
  useShortcuts();
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

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
      </header>
      <div className="flex min-h-0 flex-1">
        <CanvasView />
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-zinc-800 text-sm">
          <Inspector />
        </aside>
      </div>
      <TimelinePanel />
    </div>
  );
}
