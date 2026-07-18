import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../state/store';
import { playerRef } from '../canvas/player-ref';
import { calcDuration } from '../canvas/CanvasView';
import { formatTime } from '../timeline/Ruler';

/** M:SS.FF，FF = 帧号 % fps 两位补零 */
const formatTimecode = (frame: number, fps: number): string =>
  `${formatTime(frame, fps)}.${String(frame % fps).padStart(2, '0')}`;

const Btn: React.FC<{
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, active, children }) => (
  <button
    className={`rounded px-2 py-0.5 hover:bg-zinc-800 ${active ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
    title={title}
    onClick={onClick}
  >
    {children}
  </button>
);

export const PlaybackBar: React.FC = () => {
  const fps = useEditorStore((s) => s.undoable.fps);
  const items = useEditorStore((s) => s.undoable.items);
  const loop = useEditorStore((s) => s.loop);
  const toggleLoop = useEditorStore((s) => s.toggleLoop);
  const playerMuted = useEditorStore((s) => s.playerMuted);
  const togglePlayerMuted = useEditorStore((s) => s.togglePlayerMuted);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const durationInFrames = useMemo(() => calcDuration(items), [items]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener('play', onPlay);
    p.addEventListener('pause', onPause);
    p.addEventListener('frameupdate', onFrame);
    return () => {
      p.removeEventListener('play', onPlay);
      p.removeEventListener('pause', onPause);
      p.removeEventListener('frameupdate', onFrame);
    };
  }, []);

  // 静音是瞬时全局状态，不进 undoable，因此在这里同步给 Player
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (playerMuted) p.mute();
    else p.unmute();
  }, [playerMuted]);

  return (
    <div className="flex h-10 shrink-0 items-center justify-center gap-1 border-t border-zinc-800 bg-zinc-900 px-4 text-sm">
      <Btn title="跳到开头" onClick={() => playerRef.current?.seekTo(0)}>
        ⏮
      </Btn>
      <Btn title="播放/暂停 (空格)" onClick={() => playerRef.current?.toggle()}>
        {playing ? '⏸' : '▶'}
      </Btn>
      <Btn title="跳到结尾" onClick={() => playerRef.current?.seekTo(durationInFrames - 1)}>
        ⏭
      </Btn>
      <span className="mx-2 text-xs tabular-nums text-zinc-400" data-timecode>
        {formatTimecode(frame, fps)} / {formatTimecode(durationInFrames, fps)}
      </span>
      <Btn title="静音" active={playerMuted} onClick={togglePlayerMuted}>
        静音
      </Btn>
      <Btn title="循环" active={loop} onClick={toggleLoop}>
        循环
      </Btn>
      <Btn title="全屏" onClick={() => playerRef.current?.requestFullscreen()}>
        ⛶
      </Btn>
    </div>
  );
};
