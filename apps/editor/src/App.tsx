import { useEditorStore } from './state/store';
import { useShortcuts } from './shortcuts/useShortcuts';
import { CanvasView } from './canvas/CanvasView';
import { playerRef } from './canvas/player-ref';
import { Inspector } from './inspector/Inspector';
import { buildDemoState } from './demo-state';

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
      </header>
      <div className="flex min-h-0 flex-1">
        <CanvasView />
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-zinc-800 text-sm">
          <Inspector />
        </aside>
      </div>
      <footer className="h-56 shrink-0 border-t border-zinc-800 p-4 text-sm text-zinc-400">
        Timeline（M2）
      </footer>
    </div>
  );
}
