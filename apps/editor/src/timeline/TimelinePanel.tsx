import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Magnet, Scissors, Volume2, VolumeX } from 'lucide-react';
import type { EditorStarterItem, Track, UndoableState } from '@editor/shared';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
  bringToFront,
  maxExtendFrames,
  removeEmptyTracks,
  resolveMovePlacement,
  resolveSplitTargets,
  sendToBack,
  snapFrame,
  splitItemsAtFrame,
  trimItem,
} from './ops';
import { importFiles } from '../lib/import-assets';
import { copySelection, duplicateSelection } from '../lib/clipboard';

/** 修剪吸附阈值（官方约 3px） */
const TRIM_SNAP_PX = 3;
/** 行间边界 ±4px ⇒ 插入新轨道 */
const TRACK_GAP_PX = 4;
/** 视口左右边缘自动滚动：触发范围与步长 */
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_STEP_PX = 24;

type DragState =
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

/** 移动拖拽的轨道目标：现有行 / 在 index 处插入（bar=行间细条提示，否则渲染虚拟空行） */
type TrackTarget =
  | { kind: 'existing'; index: number }
  | { kind: 'insert'; index: number; bar: boolean };

/** 移动拖拽簿记（ref，不触发渲染）。官方模型：拖拽中不改 store，松手一次性提交 */
type MoveDrag = {
  id: string;
  downX: number;
  downY: number;
  /** 指针距块左缘 px */
  grabDX: number;
  /** 指针距行顶 px */
  grabDY: number;
  moved: boolean;
  lastClientX: number;
  lastClientY: number;
  /** 最近一次解析出的合法落点（松手时提交） */
  placement: { target: TrackTarget; from: number } | null;
};

/** 移动拖拽视觉（React state）：幽灵块 + 落位槽 + 吸附线 */
type MoveVisual = {
  id: string;
  ghostX: number;
  ghostY: number;
  target: TrackTarget;
  slotFrom: number;
  guideFrame: number | null;
};

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

/** 轨道头：只显按位置实时计算的编号（自下而上，最底行 = 1），不用存储的 name */
const TrackHeader: React.FC<{ track: Track; number: number }> = ({ track, number }) => {
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
      <span className="flex-1 truncate tabular-nums">{number}</span>
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
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** 修剪拖拽中的项（用于最大可扩展指示） */
  const [trimming, setTrimming] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  /** 修剪吸附线（帧） */
  const [trimGuide, setTrimGuide] = useState<number | null>(null);
  /** OS 文件拖放悬停位置 */
  const [dropHint, setDropHint] = useState<{ frame: number; trackIndex: number } | null>(null);

  // ---- 移动拖拽（官方模型：store 不动，视觉全在本地 state）----
  const moveRef = useRef<MoveDrag | null>(null);
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const [moveVisual, setMoveVisual] = useState<MoveVisual | null>(null);

  /** 右键命中的块（菜单动作目标）；菜单开合由 ContextMenu 组件管理 */
  const menuItemId = useRef<string | null>(null);

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

  // ---- 移动拖拽 ----

  /** 结束移动拖拽；apply=true 时一次性提交落位（永不回弹），Esc/取消则不动 store */
  const endMoveDrag = (apply: boolean) => {
    moveCleanupRef.current?.();
    moveCleanupRef.current = null;
    const d = moveRef.current;
    moveRef.current = null;
    setMoveVisual(null);
    if (!apply || !d?.moved || !d.placement) return;
    const store = useEditorStore.getState();
    const item = store.undoable.items[d.id];
    if (!item) return;
    const { target, from } = d.placement;
    // 位置没变就不进撤销栈
    if (
      target.kind === 'existing' &&
      store.undoable.tracks[target.index]?.id === item.trackId &&
      from === item.from
    ) {
      return;
    }
    store.updateUndoable((s) => {
      let st = s;
      let trackId: string;
      if (target.kind === 'insert') {
        const added = addTrack(st, target.index);
        st = added.state;
        trackId = added.trackId;
      } else {
        trackId = st.tracks[target.index]?.id ?? item.trackId;
      }
      st = { ...st, items: { ...st.items, [d.id]: { ...st.items[d.id], trackId, from } } };
      return removeEmptyTracks(st);
    });
  };

  /** 每次指针移动/自动滚动 tick：重算幽灵位置、轨道目标与落位槽（不改 store） */
  const moveTick = (clientX: number, clientY: number) => {
    const d = moveRef.current;
    const contentEl = contentRef.current;
    const panelEl = panelRef.current;
    if (!d || !contentEl || !panelEl) return;
    d.lastClientX = clientX;
    d.lastClientY = clientY;
    if (!d.moved) {
      // 3px 阈值：区分点击与拖拽
      if (Math.abs(clientX - d.downX) < 3 && Math.abs(clientY - d.downY) < 3) return;
      d.moved = true;
    }
    const store = useEditorStore.getState();
    const st = store.undoable;
    const item = st.items[d.id];
    if (!item) {
      endMoveDrag(false);
      return;
    }
    const z = store.timelineZoom;
    const cRect = contentEl.getBoundingClientRect();
    const x = clientX - cRect.left;
    const y = clientY - cRect.top;

    // 轨道目标（按原始布局判定；虚拟行只是渲染层的事）：
    // 标尺及以上 ⇒ 顶部新轨道；底行以下 ⇒ 底部新轨道；行间 ±4px ⇒ 插入条；否则现有行
    const n = st.tracks.length;
    const bottomY = RULER_HEIGHT + n * TRACK_HEIGHT;
    let target: TrackTarget;
    if (y < RULER_HEIGHT) {
      target = { kind: 'insert', index: 0, bar: false };
    } else if (y >= bottomY) {
      target = { kind: 'insert', index: n, bar: false };
    } else {
      const row = Math.min(n - 1, Math.floor((y - RULER_HEIGHT) / TRACK_HEIGHT));
      const distTop = y - (RULER_HEIGHT + row * TRACK_HEIGHT);
      const distBottom = RULER_HEIGHT + (row + 1) * TRACK_HEIGHT - y;
      if (row > 0 && distTop <= TRACK_GAP_PX) target = { kind: 'insert', index: row, bar: true };
      else if (row < n - 1 && distBottom <= TRACK_GAP_PX)
        target = { kind: 'insert', index: row + 1, bar: true };
      else target = { kind: 'existing', index: row };
    }

    // 期望帧 + 吸附（左右端取更近者；吸附成立时显示贯穿竖线）
    let desired = Math.round((x - d.grabDX) / z);
    let guideFrame: number | null = null;
    if (store.snappingEnabled) {
      const tol = Math.max(1, Math.round(SNAP_TOLERANCE_PX / z));
      const opts = {
        playheadFrame: playerRef.current?.getCurrentFrame() ?? undefined,
        ignoreIds: [d.id],
      };
      const leftSnap = snapFrame(st, desired, tol, opts);
      const rightSnap = snapFrame(st, desired + item.durationInFrames, tol, opts);
      const dl = leftSnap - desired;
      const dr = rightSnap - (desired + item.durationInFrames);
      if (dl !== 0 && (dr === 0 || Math.abs(dl) <= Math.abs(dr))) {
        desired += dl;
        guideFrame = leftSnap;
      } else if (dr !== 0) {
        desired += dr;
        guideFrame = rightSnap;
      }
    }

    const trackRef =
      target.kind === 'existing'
        ? { kind: 'existing' as const, id: st.tracks[target.index].id }
        : { kind: 'insert' as const, index: target.index };
    const { from } = resolveMovePlacement(st, d.id, desired, trackRef);
    // 被占位块顶开/钳制后吸附边不再成立 ⇒ 撤掉吸附线
    if (from !== desired) guideFrame = null;

    d.placement = { target, from };
    const pRect = panelEl.getBoundingClientRect();
    setMoveVisual({
      id: d.id,
      ghostX: clientX - pRect.left - d.grabDX,
      ghostY: clientY - pRect.top - d.grabDY,
      target,
      slotFrom: from,
      guideFrame,
    });
  };

  /** 挂 window 级监听（跨行/出面板不丢事件）+ 边缘自动滚动 + Esc 取消 */
  const startMoveDrag = () => {
    const onMove = (ev: PointerEvent) => moveTick(ev.clientX, ev.clientY);
    const onUp = () => endMoveDrag(true);
    const onCancel = () => endMoveDrag(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') endMoveDrag(false);
    };
    const timer = window.setInterval(() => {
      const el = scrollRef.current;
      const d = moveRef.current;
      if (!el || !d || !d.moved) return;
      const r = el.getBoundingClientRect();
      let step = 0;
      if (d.lastClientX < r.left + AUTO_SCROLL_EDGE_PX) step = -AUTO_SCROLL_STEP_PX;
      else if (d.lastClientX > r.right - AUTO_SCROLL_EDGE_PX) step = AUTO_SCROLL_STEP_PX;
      if (step === 0) return;
      const before = el.scrollLeft;
      el.scrollLeft = Math.max(0, before + step);
      if (el.scrollLeft !== before) moveTick(d.lastClientX, d.lastClientY);
    }, 50);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    moveCleanupRef.current = () => {
      window.clearInterval(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  };

  // ---- 修剪/框选拖拽 ----

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
    if (additive) {
      const ids = store.selectedItemIds.includes(item.id)
        ? store.selectedItemIds.filter((i) => i !== item.id)
        : [...store.selectedItemIds, item.id];
      store.setSelected(ids);
      return;
    }
    store.setSelected(store.selectedItemIds.includes(item.id) ? store.selectedItemIds : [item.id]);
    // 官方行为：多选时拖拽也只移动被抓的块
    const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    moveRef.current = {
      id: item.id,
      downX: e.clientX,
      downY: e.clientY,
      grabDX: e.clientX - blockRect.left,
      grabDY: e.clientY - (blockRect.top - 6), // 块顶距行顶 6px（top-1.5）
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      placement: null,
    };
    startMoveDrag();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const store = useEditorStore.getState();

    if (d.kind === 'trim') {
      let delta = Math.round((e.clientX - d.startX) / zoom);
      const orig = d.snapshot.items[d.id];
      let guide: number | null = null;
      if (snapping && orig) {
        // 修剪吸附（~3px 阈值）：以被拖的边缘为准
        const tol = Math.max(1, Math.round(TRIM_SNAP_PX / zoom));
        const edgeFrame =
          d.edge === 'start' ? orig.from + delta : orig.from + orig.durationInFrames + delta;
        const ignoreIds = d.rollingNeighborId ? [d.id, d.rollingNeighborId] : [d.id];
        const snapped = snapFrame(d.snapshot, edgeFrame, tol, { playheadFrame: frame, ignoreIds });
        if (snapped !== edgeFrame) {
          delta += snapped - edgeFrame;
          guide = snapped;
        }
      }
      setTrimGuide(guide);
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
    setTrimGuide(null);
    if (!d) return;
    if (d.kind === 'trim') {
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

  // ---- 块右键菜单 ----

  /** 剪切 = 复制到内部剪贴板 + 删除选中（与 Cmd+X 一致） */
  const menuCut = () => {
    copySelection();
    useEditorStore.getState().deleteSelected();
  };

  /** 置顶/置底：移到新建的最外层轨道（与画布右键菜单一致） */
  const menuReorder = (where: 'front' | 'back') => {
    const id = menuItemId.current;
    if (!id) return;
    useEditorStore
      .getState()
      .updateUndoable((s) => (where === 'front' ? bringToFront(s, id) : sendToBack(s, id)));
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

  // 顶部/底部新轨道目标时，渲染层插入一条虚拟空行（仅渲染，松手才真正建轨道）
  const virtualRowIndex =
    moveVisual && moveVisual.target.kind === 'insert' && !moveVisual.target.bar
      ? moveVisual.target.index
      : null;

  const headerRows = undoable.tracks.map((t, i) => (
    <TrackHeader key={t.id} track={t} number={undoable.tracks.length - i} />
  ));
  const laneRows = undoable.tracks.map((track) => (
    <div
      key={track.id}
      className="relative border-b border-zinc-800/50"
      style={{ height: TRACK_HEIGHT }}
    >
      {Object.values(undoable.items)
        .filter((i) => i.trackId === track.id)
        .map((item) => (
          <ItemBlock
            key={item.id}
            item={item}
            zoom={zoom}
            hidden={moveVisual?.id === item.id}
            onPointerDown={onItemPointerDown}
          />
        ))}
    </div>
  ));
  if (virtualRowIndex !== null) {
    headerRows.splice(
      virtualRowIndex,
      0,
      <div key="__virtual" className="border-b border-zinc-800/50" style={{ height: TRACK_HEIGHT }} />,
    );
    laneRows.splice(
      virtualRowIndex,
      0,
      <div
        key="__virtual"
        className="relative border-b border-zinc-800/50 bg-zinc-800/30"
        style={{ height: TRACK_HEIGHT }}
      />,
    );
  }

  /** 吸附线（移动或修剪） */
  const guideFrame = moveVisual?.guideFrame ?? trimGuide;
  const movingItem = moveVisual ? undoable.items[moveVisual.id] : null;

  return (
    <div ref={panelRef} className="relative shrink-0 border-t border-zinc-800 bg-zinc-900" style={{ height }}>
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
        <Button
          variant="ghost"
          size="xs"
          className="text-zinc-400 hover:text-zinc-200"
          title="适应：缩放到完整时长可见"
          onClick={() => {
            const el = scrollRef.current;
            if (!el || duration <= 0) return;
            // 让完整合成时长撑满可视宽度（钳制在滑杆范围内）
            setZoom(Math.min(8, Math.max(0.1, el.clientWidth / duration)));
            el.scrollLeft = 0;
          }}
        >
          适应
        </Button>
      </div>
      <div className="flex overflow-y-auto" style={{ height: `calc(100% - 2rem)` }}>
        <div className="shrink-0 border-r border-zinc-800" style={{ width: HEADER_WIDTH }}>
          <div style={{ height: RULER_HEIGHT }} />
          {headerRows}
        </div>
        <div ref={scrollRef} data-tl-scroll className="relative flex-1 overflow-x-auto">
          <ContextMenu>
            <ContextMenuTrigger
              onContextMenu={(e) => {
                // 仅命中块时弹菜单；空白区/标尺右键无菜单（官方）
                const id = (e.target as HTMLElement)
                  .closest('[data-item-block]')
                  ?.getAttribute('data-item-block');
                if (!id) {
                  e.preventDefault();
                  e.preventBaseUIHandler();
                  return;
                }
                // 右键先选中：已在多选中则保持多选，否则只选命中块
                const store = useEditorStore.getState();
                store.setSelected(
                  store.selectedItemIds.includes(id) ? store.selectedItemIds : [id],
                );
                menuItemId.current = id;
              }}
              render={
                <div
                  ref={contentRef}
                  className="relative"
                  style={{ width: contentWidth, minHeight: '100%' }}
                  onPointerDown={onBackgroundPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                />
              }
            >
            <Ruler durationInFrames={duration} fps={undoable.fps} zoom={zoom} onSeek={seekTo} />
            {laneRows}
            <Playhead frame={frame} zoom={zoom} onSeek={seekTo} />
            {/* 移动拖拽：落位槽（深灰圆角 = 松手后的合法落点）/ 行间插入条 */}
            {moveVisual && movingItem
              ? (() => {
                  const left = moveVisual.slotFrom * zoom;
                  const width = movingItem.durationInFrames * zoom;
                  if (moveVisual.target.kind === 'insert' && moveVisual.target.bar) {
                    return (
                      <div
                        data-move-slot
                        className="pointer-events-none absolute z-20 rounded bg-zinc-500"
                        style={{
                          left,
                          width,
                          top: RULER_HEIGHT + moveVisual.target.index * TRACK_HEIGHT - 2,
                          height: 4,
                        }}
                      />
                    );
                  }
                  return (
                    <div
                      data-move-slot
                      className="pointer-events-none absolute z-10 rounded bg-zinc-600/70"
                      style={{
                        left,
                        width,
                        top: RULER_HEIGHT + moveVisual.target.index * TRACK_HEIGHT + 6,
                        height: TRACK_HEIGHT - 12,
                      }}
                    />
                  );
                })()
              : null}
            {/* 吸附线：贯穿整个时间线高度 */}
            {guideFrame !== null ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-30 w-px bg-white/40"
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
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={menuCut}>剪切</ContextMenuItem>
              <ContextMenuItem onClick={() => copySelection()}>复制</ContextMenuItem>
              <ContextMenuItem onClick={() => duplicateSelection()}>创建副本</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => menuReorder('front')}>置于顶层</ContextMenuItem>
              <ContextMenuItem onClick={() => menuReorder('back')}>置于底层</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </div>
      {/* 移动拖拽：幽灵块 1:1 跟随光标（最顶层，可越过标尺/轨道头/0 帧）*/}
      {moveVisual && movingItem ? (
        <div
          className="pointer-events-none absolute z-50"
          style={{
            left: moveVisual.ghostX - movingItem.from * zoom,
            top: moveVisual.ghostY,
            width: (movingItem.from + movingItem.durationInFrames) * zoom,
            height: TRACK_HEIGHT,
          }}
        >
          <ItemBlock item={movingItem} zoom={zoom} />
        </div>
      ) : null}
    </div>
  );
};
