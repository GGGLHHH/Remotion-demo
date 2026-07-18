import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Magnet, Scissors, Volume2, VolumeX } from 'lucide-react';
import type { EditorStarterItem, Track, UndoableState } from '@editor/shared';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '../state/store';
import { playerRef } from '../canvas/player-ref';
import { calcDuration } from '@editor/shared/composition';
import { HEADER_WIDTH, RULER_HEIGHT, SNAP_TOLERANCE_PX, TRACK_HEIGHT } from './constants';
import { ItemBlock } from './ItemBlock';
import { Playhead } from './Playhead';
import { Ruler, formatTime } from './Ruler';
import {
  addTrack,
  maxExtendFrames,
  moveItems,
  removeEmptyTracks,
  resolveSplitTargets,
  snapFrame,
  splitItemsAtFrame,
  trimItem,
} from './ops';
import { importFiles } from '../lib/import-assets';

type DragState =
  | {
      kind: 'move';
      startX: number;
      startY: number;
      snapshot: UndoableState;
      ids: string[];
      /** 每个 item 拖拽前的 from 与轨道 index */
      starts: Map<string, { from: number; trackIndex: number }>;
      primaryId: string;
    }
  | {
      kind: 'trim';
      edge: 'start' | 'end';
      id: string;
      startX: number;
      snapshot: UndoableState;
      /** Alt+拖：滚动编辑联动的相邻项 */
      rollingNeighborId: string | null;
    }
  | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number };

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
          className={active ? 'text-red-400 hover:text-red-400' : 'text-zinc-400'}
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

const TrackHeader: React.FC<{ track: Track }> = ({ track }) => {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);
  const toggle = (key: 'hidden' | 'muted') =>
    updateUndoable((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === track.id ? { ...t, [key]: !t[key] } : t)),
    }));
  return (
    <div
      className="flex items-center gap-1 border-b border-zinc-800/50 px-2 text-xs text-zinc-400"
      style={{ height: TRACK_HEIGHT }}
    >
      <span className="flex-1 truncate">{track.name}</span>
      <TrackBtn title="隐藏/显示" active={track.hidden} onClick={() => toggle('hidden')}>
        {track.hidden ? <EyeOff /> : <Eye />}
      </TrackBtn>
      <TrackBtn title="静音" active={track.muted} onClick={() => toggle('muted')}>
        {track.muted ? <VolumeX /> : <Volume2 />}
      </TrackBtn>
    </div>
  );
};

export const TimelinePanel: React.FC = () => {
  const undoable = useEditorStore((s) => s.undoable);
  const zoom = useEditorStore((s) => s.timelineZoom);
  const setZoom = useEditorStore((s) => s.setTimelineZoom);
  const height = useEditorStore((s) => s.timelineHeight);
  const setHeight = useEditorStore((s) => s.setTimelineHeight);
  const snapping = useEditorStore((s) => s.snappingEnabled);

  const [frame, setFrame] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** 修剪拖拽中的项（用于最大可扩展指示） */
  const [trimming, setTrimming] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  /** OS 文件拖放悬停位置 */
  const [dropHint, setDropHint] = useState<{ frame: number; trackIndex: number } | null>(null);

  const duration = calcDuration(undoable.items);
  const contentWidth = duration * zoom + 240;

  // 播放头跟随 + 播放时自动滚动
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      setFrame(e.detail.frame);
      const el = scrollRef.current;
      if (el && p.isPlaying()) {
        const x = e.detail.frame * useEditorStore.getState().timelineZoom;
        if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) {
          el.scrollLeft = Math.max(0, x - 80);
        }
      }
    };
    p.addEventListener('frameupdate', onFrame);
    return () => p.removeEventListener('frameupdate', onFrame);
  }, []);

  const seekTo = (f: number) => {
    playerRef.current?.pause();
    playerRef.current?.seekTo(Math.max(0, f));
    setFrame(Math.max(0, f));
  };

  // ---- 拖拽 ----

  const tolFrames = Math.max(1, Math.round(SNAP_TOLERANCE_PX / zoom));

  const onItemPointerDown = (
    e: React.PointerEvent,
    item: EditorStarterItem,
    mode: 'move' | 'trim-start' | 'trim-end',
  ) => {
    if (e.button !== 0) return;
    const store = useEditorStore.getState();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (mode === 'trim-start' || mode === 'trim-end') {
      const edge = mode === 'trim-start' ? 'start' : 'end';
      let rollingNeighborId: string | null = null;
      if (e.altKey) {
        const boundary = edge === 'start' ? item.from : item.from + item.durationInFrames;
        const neighbor = Object.values(store.undoable.items).find(
          (o) =>
            o.trackId === item.trackId &&
            o.id !== item.id &&
            (edge === 'start' ? o.from + o.durationInFrames === boundary : o.from === boundary),
        );
        rollingNeighborId = neighbor?.id ?? null;
      }
      drag.current = {
        kind: 'trim',
        edge,
        id: item.id,
        startX: e.clientX,
        snapshot: store.undoable,
        rollingNeighborId,
      };
      setTrimming({ id: item.id, edge });
      return;
    }

    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let ids: string[];
    if (additive) {
      ids = store.selectedItemIds.includes(item.id)
        ? store.selectedItemIds.filter((i) => i !== item.id)
        : [...store.selectedItemIds, item.id];
      store.setSelected(ids);
      return;
    }
    ids = store.selectedItemIds.includes(item.id) ? store.selectedItemIds : [item.id];
    store.setSelected(ids);
    const starts = new Map<string, { from: number; trackIndex: number }>();
    for (const id of ids) {
      const it = store.undoable.items[id];
      if (!it) continue;
      starts.set(id, {
        from: it.from,
        trackIndex: store.undoable.tracks.findIndex((t) => t.id === it.trackId),
      });
    }
    drag.current = {
      kind: 'move',
      startX: e.clientX,
      startY: e.clientY,
      snapshot: store.undoable,
      ids,
      starts,
      primaryId: item.id,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const store = useEditorStore.getState();

    if (d.kind === 'trim') {
      const delta = Math.round((e.clientX - d.startX) / zoom);
      store.updateUndoable(
        () => {
          if (!d.rollingNeighborId) return trimItem(d.snapshot, d.id, d.edge, delta);
          // 滚动编辑：先收缩的一侧先算，腾出空间给扩展侧
          const neighborEdge = d.edge === 'end' ? 'start' : 'end';
          const itemShrinks = d.edge === 'end' ? delta < 0 : delta > 0;
          if (itemShrinks) {
            const st = trimItem(d.snapshot, d.id, d.edge, delta);
            return trimItem(st, d.rollingNeighborId, neighborEdge, delta);
          }
          const st = trimItem(d.snapshot, d.rollingNeighborId, neighborEdge, delta);
          return trimItem(st, d.id, d.edge, delta);
        },
        { commit: false },
      );
      return;
    }

    if (d.kind === 'move') {
      let deltaFrames = Math.round((e.clientX - d.startX) / zoom);
      const deltaTracks = Math.round((e.clientY - d.startY) / TRACK_HEIGHT);

      // 吸附：以主项左端为准
      const primaryStart = d.starts.get(d.primaryId)!;
      if (snapping) {
        const target = primaryStart.from + deltaFrames;
        const snapped = snapFrame(d.snapshot, target, tolFrames, {
          playheadFrame: frame,
          ignoreIds: d.ids,
        });
        deltaFrames += snapped - target;
        // 也尝试吸附右端
        const primaryItem = d.snapshot.items[d.primaryId];
        const rightTarget = primaryStart.from + deltaFrames + primaryItem.durationInFrames;
        const rightSnapped = snapFrame(d.snapshot, rightTarget, tolFrames, {
          playheadFrame: frame,
          ignoreIds: d.ids,
        });
        deltaFrames += rightSnapped - rightTarget;
      }

      let st = d.snapshot;
      const trackCount = st.tracks.length;
      const primaryTarget = primaryStart.trackIndex + deltaTracks;
      // 拖出上/下边缘 ⇒ 插入新轨道
      let indexMap = (i: number) => Math.min(trackCount - 1, Math.max(0, i + deltaTracks));
      if (primaryTarget < 0) {
        const added = addTrack(st, 0);
        st = added.state;
        indexMap = (i: number) => Math.min(st.tracks.length - 1, Math.max(0, i + deltaTracks + 1));
      } else if (primaryTarget >= trackCount) {
        const added = addTrack(st, trackCount);
        st = added.state;
        indexMap = (i: number) => Math.min(st.tracks.length - 1, Math.max(0, i + deltaTracks));
      }
      const moves = d.ids
        .filter((id) => d.starts.has(id))
        .map((id) => {
          const start = d.starts.get(id)!;
          return {
            id,
            from: Math.max(0, start.from + deltaFrames),
            trackId: st.tracks[indexMap(start.trackIndex)].id,
          };
        });
      const moved = moveItems(st, moves);
      // moveItems 冲突时返回 st；若 st 含新轨道但没用上，回退快照
      const finalState = moved === st && st !== d.snapshot ? d.snapshot : moved;
      store.updateUndoable(() => removeEmptyTracks(finalState), { commit: false });
      return;
    }

    // marquee
    d.curX = e.clientX;
    d.curY = e.clientY;
    const host = scrollRef.current!.getBoundingClientRect();
    const x1 = Math.min(d.startX, d.curX) - host.left + scrollRef.current!.scrollLeft;
    const x2 = Math.max(d.startX, d.curX) - host.left + scrollRef.current!.scrollLeft;
    const y1 = Math.min(d.startY, d.curY) - host.top;
    const y2 = Math.max(d.startY, d.curY) - host.top;
    setMarqueeRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    // 命中：帧区间 × 轨道行相交
    const f1 = x1 / zoom;
    const f2 = x2 / zoom;
    const r1 = Math.floor((y1 - RULER_HEIGHT) / TRACK_HEIGHT);
    const r2 = Math.floor((y2 - RULER_HEIGHT) / TRACK_HEIGHT);
    const hit: string[] = [];
    for (const item of Object.values(store.undoable.items)) {
      const idx = store.undoable.tracks.findIndex((t) => t.id === item.trackId);
      if (idx < r1 || idx > r2) continue;
      if (item.from < f2 && f1 < item.from + item.durationInFrames) hit.push(item.id);
    }
    store.setSelected(hit);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setMarqueeRect(null);
    setTrimming(null);
    if (!d) return;
    if (d.kind === 'move' || d.kind === 'trim') {
      useEditorStore.getState().commitPending();
    }
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-item-block]')) return;
    useEditorStore.getState().setSelected([]);
    drag.current = { kind: 'marquee', startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  // ---- OS 文件拖放 ----

  /** clientX/Y → 帧 + 轨道行（考虑滚动与缩放） */
  const dropInfo = (e: React.DragEvent) => {
    const host = scrollRef.current!;
    const rect = host.getBoundingClientRect();
    const x = e.clientX - rect.left + host.scrollLeft;
    const y = e.clientY - rect.top;
    return {
      frame: Math.max(0, Math.round(x / zoom)),
      trackIndex: Math.floor((y - RULER_HEIGHT) / TRACK_HEIGHT),
    };
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDropHint(dropInfo(e));
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropHint(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(null);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const { frame, trackIndex } = dropInfo(e);
    void importFiles(files, undefined, { frame, trackId: undoable.tracks[trackIndex]?.id });
  };

  // 面板高度拖拽
  const onResizePointerDown = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: PointerEvent) => setHeight(startH + (startY - ev.clientY));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="relative shrink-0 border-t border-zinc-800 bg-zinc-900" style={{ height }}>
      <div
        className="absolute -top-1 left-0 right-0 z-30 h-2 cursor-ns-resize"
        onPointerDown={onResizePointerDown}
      />
      <div className="flex h-8 items-center gap-3 border-b border-zinc-800 px-3 text-xs text-zinc-400">
        <span className="tabular-nums">
          {formatTime(frame, undoable.fps)} / {formatTime(duration, undoable.fps)}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className={snapping ? 'text-blue-400 hover:text-blue-400' : 'text-zinc-600 hover:text-zinc-500'}
                title="吸附 (Shift+M)"
                aria-pressed={snapping}
                onClick={() => useEditorStore.getState().toggleSnapping()}
              />
            }
          >
            <Magnet className="size-4" />
          </TooltipTrigger>
          <TooltipContent>吸附开关 (Shift+M)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-zinc-400 hover:text-zinc-200"
                title="在播放头处分割 (S)"
                onClick={() => {
                  const store = useEditorStore.getState();
                  const f = playerRef.current?.getCurrentFrame() ?? frame;
                  store.updateUndoable((s) =>
                    splitItemsAtFrame(s, f, resolveSplitTargets(s, f, store.selectedItemIds)),
                  );
                }}
              />
            }
          >
            <Scissors className="size-4" />
          </TooltipTrigger>
          <TooltipContent>在播放头处分割 (S)</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <span>缩放</span>
        <div className="w-32">
          <Slider
            min={0.1}
            max={8}
            step={0.1}
            value={[zoom]}
            onValueChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)}
          />
        </div>
      </div>
      <div className="flex overflow-y-auto" style={{ height: `calc(100% - 2rem)` }}>
        <div className="shrink-0 border-r border-zinc-800" style={{ width: HEADER_WIDTH }}>
          <div style={{ height: RULER_HEIGHT }} />
          {undoable.tracks.map((t) => (
            <TrackHeader key={t.id} track={t} />
          ))}
        </div>
        <div ref={scrollRef} data-tl-scroll className="relative flex-1 overflow-x-auto">
          <div
            className="relative"
            style={{ width: contentWidth, minHeight: '100%' }}
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <Ruler durationInFrames={duration} fps={undoable.fps} zoom={zoom} onSeek={seekTo} />
            {undoable.tracks.map((track) => (
              <div
                key={track.id}
                className="relative border-b border-zinc-800/50"
                style={{ height: TRACK_HEIGHT }}
              >
                {Object.values(undoable.items)
                  .filter((i) => i.trackId === track.id)
                  .map((item) => (
                    <ItemBlock key={item.id} item={item} zoom={zoom} onPointerDown={onItemPointerDown} />
                  ))}
              </div>
            ))}
            <Playhead frame={frame} zoom={zoom} onSeek={seekTo} />
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
                    trimming.edge === 'start'
                      ? (it.from - frames) * zoom
                      : (it.from + it.durationInFrames) * zoom;
                  return (
                    <div
                      className="pointer-events-none absolute z-10 rounded border border-dashed border-white/30"
                      style={{
                        left,
                        width: frames * zoom,
                        top: RULER_HEIGHT + trackIndex * TRACK_HEIGHT + 6,
                        height: TRACK_HEIGHT - 12,
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
                      top: RULER_HEIGHT + dropHint.trackIndex * TRACK_HEIGHT,
                      height: TRACK_HEIGHT,
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
          </div>
        </div>
      </div>
    </div>
  );
};
