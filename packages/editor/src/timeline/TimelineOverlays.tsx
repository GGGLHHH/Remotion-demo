import type React from 'react';
import type { EditorStarterItem, UndoableState } from '@gedatou/shared';
import { AUDIO_TRACK_HEIGHT, MEDIA_TRACK_HEIGHT, TRACK_HEIGHT } from './constants';
import { maxExtendFrames } from './ops';
import { ItemBlock } from './ItemBlock';
import type { MoveVisual } from './types';

type Trimming = { id: string; edge: 'start' | 'end' } | null;
type DropHint = { frame: number; trackIndex: number } | null;
type MarqueeRect = { x: number; y: number; w: number; h: number } | null;

// 时间线内容层浮层(移动落位槽/插入条、吸附线、修剪最大可扩展指示、OS 拖放提示、框选框)。
// 纯展示:把已算好的 state 映射成 DOM,无自身状态。从 TimelinePanel 搬出,面板只保留状态/事件 + 组装。
export const TimelineOverlays: React.FC<{
  undoable: UndoableState;
  zoom: number;
  tops: number[];
  rowHeights: number[];
  moveVisual: MoveVisual | null;
  movingItem: EditorStarterItem | null;
  guideFrame: number | null;
  trimming: Trimming;
  dropHint: DropHint;
  marqueeRect: MarqueeRect;
}> = ({ undoable, zoom, tops, rowHeights, moveVisual, movingItem, guideFrame, trimming, dropHint, marqueeRect }) => (
  <>
    {/* 移动拖拽：落位槽（深灰圆角 = 松手后的合法落点）/ 行间插入条 */}
    {moveVisual && movingItem
      ? (() => {
          const left = moveVisual.slotFrom * zoom;
          const width = movingItem.durationInFrames * zoom;
          if (moveVisual.target.kind === 'insert' && moveVisual.target.bar) {
            return (
              <div
                data-move-slot
                className="pointer-events-none absolute z-20 rounded bg-muted-foreground"
                style={{
                  left,
                  width,
                  top: tops[moveVisual.target.index] - 2,
                  height: 4,
                }}
              />
            );
          }
          // 现有行按该行行高；插入目标落在虚拟空行（普通行高）
          const slotRowH =
            moveVisual.target.kind === 'existing' ? rowHeights[moveVisual.target.index] : TRACK_HEIGHT;
          return (
            <div
              data-move-slot
              className="pointer-events-none absolute z-10 rounded bg-muted-foreground/70"
              style={{
                left,
                width,
                top: tops[moveVisual.target.index] + 6,
                height: slotRowH - 12,
              }}
            />
          );
        })()
      : null}
    {/* 吸附线：贯穿整个时间线高度（官方 1px neutral-700） */}
    {guideFrame !== null ? (
      <div
        className="pointer-events-none absolute inset-y-0 z-30 w-px bg-muted-foreground"
        style={{ left: guideFrame * zoom }}
      />
    ) : null}
    {/* 修剪拖拽：媒体最大可扩展范围指示（斜纹） */}
    {trimming
      ? (() => {
          const it = undoable.items[trimming.id];
          const ext = it ? maxExtendFrames(undoable, trimming.id) : null;
          if (!it || !ext) return null;
          const frames = trimming.edge === 'start' ? ext.left : ext.right;
          if (frames <= 0) return null;
          const trackIndex = undoable.tracks.findIndex((t) => t.id === it.trackId);
          if (trackIndex < 0) return null;
          const left =
            trimming.edge === 'start' ? (it.from - frames) * zoom : (it.from + it.durationInFrames) * zoom;
          return (
            <div
              className="pointer-events-none absolute z-10 rounded border border-dashed border-white/30"
              style={{
                left,
                width: frames * zoom,
                top: tops[trackIndex] + 6,
                height: rowHeights[trackIndex] - 12,
                background:
                  'repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0 6px, transparent 6px 12px)',
              }}
            />
          );
        })()
      : null}
    {/* OS 文件拖放指示：落点竖线 + 悬停轨道高亮 */}
    {dropHint ? (
      <>
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-blue-400"
          style={{ left: dropHint.frame * zoom }}
        />
        {dropHint.trackIndex >= 0 && dropHint.trackIndex < undoable.tracks.length ? (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 bg-blue-400/10"
            style={{
              top: tops[dropHint.trackIndex],
              height: rowHeights[dropHint.trackIndex],
            }}
          />
        ) : null}
      </>
    ) : null}
    {marqueeRect ? (
      <div
        className="pointer-events-none absolute z-10 border border-blue-400 bg-blue-400/10"
        style={{
          left: marqueeRect.x,
          top: marqueeRect.y,
          width: marqueeRect.w,
          height: marqueeRect.h,
        }}
      />
    ) : null}
  </>
);

// 移动拖拽的幽灵块（1:1 跟随光标，面板最顶层，可越过标尺/轨道头/0 帧）。
export const TimelineGhost: React.FC<{
  zoom: number;
  moveVisual: MoveVisual | null;
  movingItem: EditorStarterItem | null;
}> = ({ zoom, moveVisual, movingItem }) =>
  moveVisual && movingItem ? (
    <div
      className="pointer-events-none absolute z-50"
      style={{
        left: moveVisual.ghostX - movingItem.from * zoom,
        top: moveVisual.ghostY,
        width: (movingItem.from + movingItem.durationInFrames) * zoom,
        // 幽灵块保持自身类型对应的行高（媒体块拖拽中不缩小）
        height:
          movingItem.type === 'video'
            ? MEDIA_TRACK_HEIGHT
            : movingItem.type === 'audio'
              ? AUDIO_TRACK_HEIGHT
              : TRACK_HEIGHT,
      }}
    >
      <ItemBlock item={movingItem} zoom={zoom} />
    </div>
  ) : null;
