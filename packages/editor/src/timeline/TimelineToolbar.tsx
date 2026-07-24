import type React from 'react';
import { Magnet, Minus, Plus, Scissors } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Slider } from '../components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { useT } from '../lib/i18n';
import { usePlayerFrameDerived } from '../canvas/player-ref';
import { formatTime } from './Ruler';

/** 工具栏时间码(当前/总时长):秒级读数,仅显示文本变化时才重渲(播放中 ~1 次/秒) */
const TimecodeReadout: React.FC<{ fps: number; duration: number }> = ({ fps, duration }) => {
  const cur = usePlayerFrameDerived((f) => formatTime(f, fps));
  return (
    <span className="tabular-nums">
      {cur} / {formatTime(duration, fps)}
    </span>
  );
};

// 时间线工具栏(时间码 + 吸附/分割 + 缩放滑杆)。纯展示:依赖全是值/回调,无 store 订阅
// (TimecodeReadout 自订阅播放头帧)。从 TimelinePanel 搬出,面板只保留状态与事件、渲染 <TimelineToolbar/>。
export const TimelineToolbar: React.FC<{
  fps: number;
  duration: number;
  snapping: boolean;
  splittable: boolean;
  zoom: number;
  zoomSetting: number | 'fit';
  fitZoom: number;
  setZoom: (z: number | 'fit') => void;
  onToggleSnapping: () => void;
  onSplit: () => void;
  onFit: () => void;
}> = ({ fps, duration, snapping, splittable, zoom, zoomSetting, fitZoom, setZoom, onToggleSnapping, onSplit, onFit }) => {
  const t = useT();
  return (
    <div className="flex h-8 items-center gap-3 border-b border-border px-3 text-xs text-muted-foreground">
      <TimecodeReadout fps={fps} duration={duration} />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className={snapping ? 'text-blue-400 hover:text-blue-400' : 'text-muted-foreground hover:text-foreground'}
              title={t('timeline.snapTitle')}
              aria-pressed={snapping}
              onClick={onToggleSnapping}
            />
          }
        >
          <Magnet className="size-4" />
        </TooltipTrigger>
        <TooltipContent>{t('timeline.snapTooltip')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              title={t('timeline.split')}
              disabled={!splittable}
              onClick={onSplit}
            />
          }
        >
          <Scissors className="size-4" />
        </TooltipTrigger>
        <TooltipContent>{t('timeline.split')}</TooltipContent>
      </Tooltip>
      <div className="flex-1" />
      {/* 官方缩放模型：滑杆 0..1，0 = 适应（自动跟随内容/面板宽度），>0 在 [fit, 8] 间指数插值 */}
      <span className="cursor-pointer" title={t('timeline.zoomResetTitle')} onClick={() => setZoom('fit')}>
        {t('timeline.zoom')}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-foreground"
        title={t('timeline.zoomOut')}
        onClick={() => setZoom(zoom / 2)}
      >
        <Minus className="size-3" />
      </Button>
      <div className="w-32">
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[
            zoomSetting === 'fit'
              ? 0
              : 8 / fitZoom <= 1
                ? 1
                : Math.min(1, Math.max(0, Math.log(zoomSetting / fitZoom) / Math.log(8 / fitZoom))),
          ]}
          onValueChange={(v) => {
            const pos = Array.isArray(v) ? v[0] : v;
            if (pos <= 0) setZoom('fit');
            else setZoom(8 / fitZoom <= 1 ? 8 : fitZoom * (8 / fitZoom) ** pos);
          }}
        />
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-foreground"
        title={t('timeline.zoomIn')}
        onClick={() => setZoom(zoom * 2)}
      >
        <Plus className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className={zoomSetting === 'fit' ? 'text-blue-400 hover:text-blue-400' : 'text-muted-foreground hover:text-foreground'}
        title={t('timeline.fitTitle')}
        onClick={onFit}
      >
        {t('timeline.fit')}
      </Button>
    </div>
  );
};
