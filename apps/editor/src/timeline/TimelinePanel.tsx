import type React from 'react';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Magnet, Minus, Plus, Scissors, Volume2, VolumeX } from 'lucide-react';
import type { EditorStarterItem, Track, UndoableState } from '@gedatou/shared';
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
import { getPlayerFrame, playerRef, usePlayerFrameDerived } from '../canvas/player-ref';
import { calcDuration } from '@gedatou/shared/composition';
import {
  HEADER_WIDTH,
  AUDIO_TRACK_HEIGHT,
  MEDIA_TRACK_HEIGHT,
  RULER_HEIGHT,
  SNAP_TOLERANCE_PX,
  TRACK_HEIGHT,
} from './constants';
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
  rollEdit,
  sendToBack,
  snapFrame,
  splitItemsAtFrame,
  trimItem,
} from './ops';
import { importFiles } from '../lib/import-assets';
import { copySelection, duplicateSelection } from '../lib/clipboard';

/** 修剪吸附阈值（官方约 10px） */
const TRIM_SNAP_PX = 10;
/** 行间边界 ±4px ⇒ 插入新轨道 */
const TRACK_GAP_PX = 4;
/** 视口左右边缘自动滚动：触发范围与步长 */
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_STEP_PX = 24;

// ---- 变高行几何（官方：含视频/音频的轨道行更高）：所有 y↔行 换算统一走前缀和 ----

/** 单条轨道行高（官方）：含视频 ⇒ 70，纯音频 ⇒ 48，其余 ⇒ 34 */
const rowHeightOf = (st: UndoableState, trackId: string): number => {
  let hasAudio = false;
  for (const i of Object.values(st.items)) {
    if (i.trackId !== trackId) continue;
    if (i.type === 'video') return MEDIA_TRACK_HEIGHT;
    if (i.type === 'audio') hasAudio = true;
  }
  return hasAudio ? AUDIO_TRACK_HEIGHT : TRACK_HEIGHT;
};

/** 前缀和（内容坐标，含标尺）：tops[i] = 第 i 行顶部 y，tops[n] = 所有行底部 */
const rowTops = (st: UndoableState): number[] => {
  const tops = [RULER_HEIGHT];
  for (const t of st.tracks) tops.push(tops[tops.length - 1] + rowHeightOf(st, t.id));
  return tops;
};

/** y（内容坐标）→ 行号；标尺内 = -1，底行之下 = 轨道数 n */
const trackIndexAtY = (st: UndoableState, y: number): number => {
  if (y < RULER_HEIGHT) return -1;
  const tops = rowTops(st);
  for (let i = 0; i < st.tracks.length; i++) if (y < tops[i + 1]) return i;
  return st.tracks.length;
};

type DragState =
  | {
      kind: 'trim';
      edge: 'start' | 'end';
      id: string;
      startX: number;
      snapshot: UndoableState;
      /** 滚动编辑（相邻块边界热区）联动的相邻项 */
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

/** 轨道头：只显按位置实时计算的编号（自下而上，最底行 = 1），不用存储的 name。
    memo：props 稳定（track 对象仅真实编辑时换引用），面板重渲时整行跳过 */
const TrackHeader = memo<{ track: Track; number: number; height: number }>(function TrackHeader({
  track,
  number,
  height,
}) {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);
  const toggle = (key: 'hidden' | 'muted') =>
    updateUndoable((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === track.id ? { ...t, [key]: !t[key] } : t)),
    }));
  return (
    <div
      className="flex items-center gap-1 border-b border-zinc-800/50 px-2 text-xs text-zinc-400"
      style={{ height }}
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
});

/** 工具栏时间码（当前/总时长）：秒级读数，仅显示文本变化时才重渲（播放中 ~1 次/秒） */
const TimecodeReadout: React.FC<{ fps: number; duration: number }> = ({ fps, duration }) => {
  const cur = usePlayerFrameDerived((f) => formatTime(f, fps));
  return (
    <span className="tabular-nums">
      {cur} / {formatTime(duration, fps)}
    </span>
  );
};

export const TimelinePanel: React.FC = () => {
  const undoable = useEditorStore((s) => s.undoable);
  const zoomSetting = useEditorStore((s) => s.timelineZoom);
  const setZoom = useEditorStore((s) => s.setTimelineZoom);
  const height = useEditorStore((s) => s.timelineHeight);
  const setHeight = useEditorStore((s) => s.setTimelineHeight);
  const snapping = useEditorStore((s) => s.snappingEnabled);
  const selectedIds = useEditorStore((s) => s.selectedItemIds);

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

  // ---- 有效缩放（唯一出口）：'fit' ⇒ 内容撑满可视宽度，随面板宽度/内容时长自动重算 ----
  const [viewW, setViewW] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fitZoom = Math.min(8, Math.max(0.1, viewW / Math.max(1, duration)));
  const zoom = zoomSetting === 'fit' ? fitZoom : zoomSetting;
  /** 供拖拽 window 监听/播放跟随读取的最新有效缩放 */
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // fit 模式内容刚好占满（无横向滚动）；数字模式末尾留 240px 拖拽余量
  const contentWidth = Math.max(duration * zoom + (zoomSetting === 'fit' ? 0 : 240), viewW);
  // 剪刀按钮：播放头没有落在任何可分割目标内部时禁用（官方行为）。
  // 派生订阅：仅布尔值翻转时才重渲面板（播放中不再 30 次/秒全量重渲）
  const splittable = usePlayerFrameDerived((f) =>
    resolveSplitTargets(undoable, f, selectedIds).some((id) => {
      const it = undoable.items[id];
      return it !== undefined && f > it.from && f < it.from + it.durationInFrames;
    }),
  );

  // 播放头跟随 + 播放时自动滚动（不与用户的手动滚动抢方向盘）。
  // 直接改 scrollLeft，不进 React state——播放中零重渲
  const lastPlayheadX = useRef<number | null>(null);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      const el = scrollRef.current;
      if (el && p.isPlaying()) {
        const x = e.detail.frame * zoomRef.current;
        const last = lastPlayheadX.current;
        lastPlayheadX.current = x;
        const rightEdge = el.scrollLeft + el.clientWidth - 40;
        if (last !== null && x < last) {
          // 播放头回跳（循环重播）：视口跟回
          el.scrollLeft = Math.max(0, x - 80);
        } else if (last !== null && last <= rightEdge && x > rightEdge) {
          // 播放头刚越过右缘：向前翻页；用户已滚远时（上帧就在缘外）不触发
          el.scrollLeft = Math.max(0, x - 80);
        }
      } else {
        lastPlayheadX.current = null;
      }
    };
    p.addEventListener('frameupdate', onFrame);
    return () => p.removeEventListener('frameupdate', onFrame);
  }, []);

  // seek 触发 frameupdate，播放头/时间码各自订阅更新，这里无需本地 state
  const seekTo = (f: number) => {
    playerRef.current?.pause();
    playerRef.current?.seekTo(Math.max(0, f));
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
    const z = zoomRef.current;
    const cRect = contentEl.getBoundingClientRect();
    const x = clientX - cRect.left;
    const y = clientY - cRect.top;

    // 轨道目标（按原始布局判定；虚拟行只是渲染层的事）：
    // 标尺及以上 ⇒ 顶部新轨道；底行以下 ⇒ 底部新轨道；行间 ±4px ⇒ 插入条；否则现有行
    const n = st.tracks.length;
    const tops = rowTops(st);
    let target: TrackTarget;
    if (y < RULER_HEIGHT) {
      target = { kind: 'insert', index: 0, bar: false };
    } else if (y >= tops[n]) {
      target = { kind: 'insert', index: n, bar: false };
    } else {
      const row = trackIndexAtY(st, y);
      const distTop = y - tops[row];
      const distBottom = tops[row + 1] - y;
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

  const onItemPointerDownImpl = (
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
      // 官方：按下修剪手柄立即独占选中该项（mousedown 即生效，无需移动）
      store.setSelected([item.id]);
      drag.current = {
        kind: 'trim',
        edge,
        id: item.id,
        startX: e.clientX,
        snapshot: store.undoable,
        rollingNeighborId: null,
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
    const blockEl = e.currentTarget as HTMLElement;
    const blockRect = blockEl.getBoundingClientRect();
    // 行顶取块的父级行元素（不写死块的 inset，行高/块内边距变化都不受影响）
    const rowTop = blockEl.parentElement?.getBoundingClientRect().top ?? blockRect.top;
    moveRef.current = {
      id: item.id,
      downX: e.clientX,
      downY: e.clientY,
      grabDX: e.clientX - blockRect.left,
      grabDY: e.clientY - rowTop,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      placement: null,
    };
    startMoveDrag();
  };

  /** 引用恒定的块按下回调（useEvent 模式）：配合 memo(ItemBlock) 跳过无关重渲 */
  const onItemPointerDownRef = useRef(onItemPointerDownImpl);
  onItemPointerDownRef.current = onItemPointerDownImpl;
  const onItemPointerDown = useCallback(
    (e: React.PointerEvent, item: EditorStarterItem, mode: 'move' | 'trim-start' | 'trim-end') =>
      onItemPointerDownRef.current(e, item, mode),
    [],
  );

  /** 相邻块边界滚动编辑（官方：4px ew-resize 热区，无需修饰键）：A 出点 + B 入点联动 */
  const onRollPointerDown = (e: React.PointerEvent, aId: string, bId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      kind: 'trim',
      edge: 'end',
      id: aId,
      startX: e.clientX,
      snapshot: useEditorStore.getState().undoable,
      rollingNeighborId: bId,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const store = useEditorStore.getState();

    if (d.kind === 'trim') {
      // 官方：按住 Shift 完全抑制修剪（边缘回到起拖位置，松开恢复）
      if (e.shiftKey) {
        setTrimGuide(null);
        store.updateUndoable(() => d.snapshot, { commit: false });
        return;
      }
      let delta = Math.round((e.clientX - d.startX) / zoom);
      const orig = d.snapshot.items[d.id];
      let guide: number | null = null;
      if (snapping && orig) {
        // 修剪吸附（官方约 10px 阈值）：以被拖的边缘为准；播放头不是修剪吸附目标
        const tol = Math.max(1, Math.round(TRIM_SNAP_PX / zoom));
        const edgeFrame =
          d.edge === 'start' ? orig.from + delta : orig.from + orig.durationInFrames + delta;
        const ignoreIds = d.rollingNeighborId ? [d.id, d.rollingNeighborId] : [d.id];
        const snapped = snapFrame(d.snapshot, edgeFrame, tol, { ignoreIds });
        if (snapped !== edgeFrame) {
          delta += snapped - edgeFrame;
          guide = snapped;
        }
      }
      setTrimGuide(guide);
      store.updateUndoable(
        () =>
          d.rollingNeighborId
            ? rollEdit(d.snapshot, d.id, d.rollingNeighborId, delta)
            : trimItem(d.snapshot, d.id, d.edge, delta),
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
    const r1 = trackIndexAtY(store.undoable, y1);
    const r2 = trackIndexAtY(store.undoable, y2);
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
      trackIndex: trackIndexAtY(undoable, y),
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

  /** 当前布局的行高与前缀和（渲染层与所有覆盖物统一使用） */
  const rowHeights = undoable.tracks.map((t) => rowHeightOf(undoable, t.id));
  const tops = rowTops(undoable);

  const headerRows = undoable.tracks.map((t, i) => (
    <TrackHeader key={t.id} track={t} number={undoable.tracks.length - i} height={rowHeights[i]} />
  ));
  const laneRows = undoable.tracks.map((track, ti) => {
    const rowItems = Object.values(undoable.items).filter((i) => i.trackId === track.id);
    return (
      <div
        key={track.id}
        className="relative border-b border-zinc-800/50"
        style={{ height: rowHeights[ti] }}
      >
        {rowItems.map((item) => (
          <ItemBlock
            key={item.id}
            item={item}
            zoom={zoom}
            hidden={moveVisual?.id === item.id}
            onPointerDown={onItemPointerDown}
          />
        ))}
        {/* 帧级相邻的两块边界：4px 滚动编辑热区（压在两侧修剪手柄之上） */}
        {rowItems.flatMap((a) => {
          const b = rowItems.find((o) => o.from === a.from + a.durationInFrames);
          if (!b) return [];
          return [
            <div
              key={`roll-${a.id}`}
              data-roll
              className="absolute inset-y-1.5 z-40 w-1 cursor-ew-resize"
              style={{ left: b.from * zoom - 2 }}
              onPointerDown={(e) => onRollPointerDown(e, a.id, b.id)}
            />,
          ];
        })}
      </div>
    );
  });
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
        <TimecodeReadout fps={undoable.fps} duration={duration} />
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
                disabled={!splittable}
                onClick={() => {
                  const store = useEditorStore.getState();
                  const f = getPlayerFrame();
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
        {/* 官方缩放模型：滑杆 0..1，0 = 适应（自动跟随内容/面板宽度），>0 在 [fit, 8] 间指数插值 */}
        <span className="cursor-pointer" title="点击回到适应" onClick={() => setZoom('fit')}>
          缩放
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-zinc-400 hover:text-zinc-200"
          title="缩小"
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
          className="text-zinc-400 hover:text-zinc-200"
          title="放大"
          onClick={() => setZoom(zoom * 2)}
        >
          <Plus className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className={
            zoomSetting === 'fit'
              ? 'text-blue-400 hover:text-blue-400'
              : 'text-zinc-400 hover:text-zinc-200'
          }
          title="适应：缩放到完整时长可见"
          onClick={() => {
            setZoom('fit');
            if (scrollRef.current) scrollRef.current.scrollLeft = 0;
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
            <Playhead zoom={zoom} onSeek={seekTo} />
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
                          top: tops[moveVisual.target.index] - 2,
                          height: 4,
                        }}
                      />
                    );
                  }
                  // 现有行按该行行高；插入目标落在虚拟空行（普通行高）
                  const slotRowH =
                    moveVisual.target.kind === 'existing'
                      ? rowHeights[moveVisual.target.index]
                      : TRACK_HEIGHT;
                  return (
                    <div
                      data-move-slot
                      className="pointer-events-none absolute z-10 rounded bg-zinc-600/70"
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
                className="pointer-events-none absolute inset-y-0 z-30 w-px bg-neutral-700"
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
      ) : null}
    </div>
  );
};
