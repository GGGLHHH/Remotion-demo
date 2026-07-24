import type React from 'react';
import { memo } from 'react';
import { Eye, EyeOff, Volume2, VolumeX } from 'lucide-react';
import type { Track } from '@gedatou/shared';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { useEditor } from '../state/context';
import { useT } from '../lib/i18n';

/** 轨道头图标按钮：保留 title + Tooltip 中文说明 */
const TrackBtn: React.FC<{
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, active, onClick, children }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant="ghost"
          size="icon-xs"
          className={active ? 'text-red-400 hover:text-red-400' : 'text-muted-foreground'}
          title={title}
          onClick={onClick}
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent>{title}</TooltipContent>
  </Tooltip>
);

/** 轨道头：只显按位置实时计算的编号（自下而上，最底行 = 1），不用存储的 name。
    memo：props 稳定（track 对象仅真实编辑时换引用），面板重渲时整行跳过 */
export const TrackHeader = memo<{ track: Track; number: number; height: number }>(function TrackHeader({
  track,
  number,
  height,
}) {
  const t = useT();
  const updateUndoable = useEditor((s) => s.updateUndoable);
  const toggle = (key: 'hidden' | 'muted') =>
    updateUndoable((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === track.id ? { ...t, [key]: !t[key] } : t)),
    }));
  return (
    <div
      className="flex items-center gap-1 border-b border-border/50 px-2 text-xs text-muted-foreground"
      style={{ height }}
    >
      <span className="flex-1 truncate tabular-nums">{number}</span>
      <TrackBtn title={t('timeline.trackHideShow')} active={track.hidden} onClick={() => toggle('hidden')}>
        {track.hidden ? <EyeOff /> : <Eye />}
      </TrackBtn>
      <TrackBtn title={t('timeline.trackMute')} active={track.muted} onClick={() => toggle('muted')}>
        {track.muted ? <VolumeX /> : <Volume2 />}
      </TrackBtn>
    </div>
  );
});
