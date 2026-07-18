import { Player } from '@remotion/player';
import { MainComposition } from '@editor/shared/composition';
import { useMemo, useState } from 'react';
import { buildDemoState } from './demo-state';

export default function App() {
  const [state] = useState(buildDemoState);
  const durationInFrames = useMemo(() => {
    let max = 1;
    for (const item of Object.values(state.items)) {
      max = Math.max(max, item.from + item.durationInFrames);
    }
    return max;
  }, [state]);

  return (
    <div className="flex h-screen flex-col bg-zinc-900 text-zinc-100">
      <header className="flex h-12 shrink-0 items-center border-b border-zinc-800 px-4 text-sm">
        Remotion Editor
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 items-center justify-center bg-zinc-950 p-8">
          <Player
            component={MainComposition}
            inputProps={{ state }}
            durationInFrames={durationInFrames}
            compositionWidth={state.compositionWidth}
            compositionHeight={state.compositionHeight}
            fps={state.fps}
            controls
            loop
            style={{
              height: '100%',
              aspectRatio: `${state.compositionWidth} / ${state.compositionHeight}`,
            }}
          />
        </main>
        <aside className="w-72 shrink-0 border-l border-zinc-800 p-4 text-sm text-zinc-400">
          Inspector（M1）
        </aside>
      </div>
      <footer className="h-56 shrink-0 border-t border-zinc-800 p-4 text-sm text-zinc-400">
        Timeline（M2）
      </footer>
    </div>
  );
}
