import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Maximize, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '../state/store';
import { playerRef, usePlayerFrame } from '../canvas/player-ref';
import { calcDuration } from '@editor/shared/composition';
import { formatTime } from '../timeline/Ruler';

/** M:SS.FF，FF = 帧号 % fps 两位补零 */
const formatTimecode = (frame: number, fps: number): string =>
  `${formatTime(frame, fps)}.${String(frame % fps).padStart(2, '0')}`;

/** 时间码读数：每帧更新但只重渲这一个小 span，不再拖着整条控制条（7 个 Tooltip 按钮）陪跑 */
const Timecode: React.FC<{ fps: number; durationInFrames: number }> = ({ fps, durationInFrames }) => {
  const frame = usePlayerFrame();
  return (
    <span className="mx-2 text-xs tabular-nums text-zinc-400" data-timecode>
      {formatTimecode(frame, fps)} / {formatTimecode(durationInFrames, fps)}
    </span>
  );
};

/** 图标按钮：保留 title（e2e 依赖 getByTitle）+ Tooltip 中文说明 */
const Btn: React.FC<{
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, active, children }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button variant={active ? 'secondary' : 'ghost'} size="icon-sm" title={title} onClick={onClick} />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent>{title}</TooltipContent>
  </Tooltip>
);

export const PlaybackBar: React.FC = () => {
  const fps = useEditorStore((s) => s.undoable.fps);
  const items = useEditorStore((s) => s.undoable.items);
  const loop = useEditorStore((s) => s.loop);
  const toggleLoop = useEditorStore((s) => s.toggleLoop);
  const playerMuted = useEditorStore((s) => s.playerMuted);
  const togglePlayerMuted = useEditorStore((s) => s.togglePlayerMuted);
  const [playing, setPlaying] = useState(false);
  const durationInFrames = useMemo(() => calcDuration(items), [items]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener('play', onPlay);
    p.addEventListener('pause', onPause);
    return () => {
      p.removeEventListener('play', onPlay);
      p.removeEventListener('pause', onPause);
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
        <SkipBack />
      </Btn>
      <Btn title="播放/暂停 (空格)" onClick={() => playerRef.current?.toggle()}>
        {playing ? <Pause /> : <Play />}
      </Btn>
      <Btn title="跳到结尾" onClick={() => playerRef.current?.seekTo(durationInFrames - 1)}>
        <SkipForward />
      </Btn>
      <Timecode fps={fps} durationInFrames={durationInFrames} />
      <Btn title="静音" active={playerMuted} onClick={togglePlayerMuted}>
        {playerMuted ? <VolumeX /> : <Volume2 />}
      </Btn>
      <Btn title="循环" active={loop} onClick={toggleLoop}>
        <Repeat />
      </Btn>
      <Btn title="全屏" onClick={() => playerRef.current?.requestFullscreen()}>
        <Maximize />
      </Btn>
    </div>
  );
};
