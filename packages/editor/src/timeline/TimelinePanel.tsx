import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorStarterItem, Transition } from '@gedatou/shared';
import { cn } from '../lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../components/ui/context-menu';
import { useEditor, useEditorApi, useEditorDeps, useEditorRefs } from '../state/context';
import { usePlayerFrameDerived } from '../canvas/player-ref';
import { calcDuration } from '@gedatou/shared/composition';
import { HEADER_WIDTH, RULER_HEIGHT, TRACK_HEIGHT } from './constants';
import { Playhead } from './Playhead';
import { Ruler } from './Ruler';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineGhost, TimelineOverlays } from './TimelineOverlays';
import { TimelineTracks } from './TimelineTracks';
import { TrackHeader } from './TrackHeader';
import { useMoveDrag } from './use-move-drag';
import type { DragState } from './types';
import {
  bringToFront,
  resolveSplitTargets,
  rollEdit,
  sendToBack,
  snapFrame,
  splitItemsAtFrame,
  trimItem,
} from './ops';
import { rowHeightOf, rowTops, trackIndexAtY } from './geometry';
import { importFiles } from '../lib/import-assets';
import { copySelection, duplicateSelection } from '../lib/clipboard';
import { addTransition, applyTransitionDuration } from '../lib/transition-ops';
import { useT } from '../lib/i18n';

/** 修剪吸附阈值（官方约 10px） */
const TRIM_SNAP_PX = 10;

export const TimelinePanel: React.FC<{ className?: string }> = ({ className }) => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const refs = useEditorRefs();
  const undoable = useEditor((s) => s.undoable);
  const zoomSetting = useEditor((s) => s.timelineZoom);
  const setZoom = useEditor((s) => s.setTimelineZoom);
  const height = useEditor((s) => s.timelineHeight);
  const setHeight = useEditor((s) => s.setTimelineHeight);
  const snapping = useEditor((s) => s.snappingEnabled);
  const selectedIds = useEditor((s) => s.selectedItemIds);
  // transitions 是加法字段：消费方(如 workbench-v2)可能持有早于该字段的 state，缺省为空表
  const transitions = useEditor((s) => s.undoable.transitions) ?? ({} as Record<string, Transition>);
  const selectedTransitionId = useEditor((s) => s.selectedTransitionId);

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
  // 移动拖拽状态机(私有 ref + window 监听 + 自动滚动);入口 startMove 由块 pointerdown 的 move 分支调用
  const { moveVisual, startMove } = useMoveDrag({ editorApi, refs, panelRef, contentRef, scrollRef, zoomRef });
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
    const p = refs.player.current;
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
    refs.player.current?.pause();
    refs.player.current?.seekTo(Math.max(0, f));
  };

  // ---- 修剪/框选拖拽 ----

  const onItemPointerDownImpl = (
    e: React.PointerEvent,
    item: EditorStarterItem,
    mode: 'move' | 'trim-start' | 'trim-end',
  ) => {
    if (e.button !== 0) return;
    const store = editorApi.getState();
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
        moved: false,
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
    // 官方行为：多选时拖拽也只移动被抓的块（移动拖拽状态机见 useMoveDrag）
    startMove(item, e);
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
      snapshot: editorApi.getState().undoable,
      rollingNeighborId: bId,
      moved: false,
    };
  };

  /** 转场 pill 拖拽调时长（手柄小拖拽骨架，同 ItemBlock 的 startHandleDrag）：
      指针 x → 内容坐标帧号，newDur = A 出点 − 该帧（钳制在 op 内做），松手一次性提交 */
  const onTransitionPointerDown = (e: React.PointerEvent, tr: Transition, a: EditorStarterItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    editorApi.getState().setSelectedTransition(tr.id);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const aEnd = a.from + a.durationInFrames;
    const onMove = (ev: PointerEvent) => {
      const cRect = contentRef.current?.getBoundingClientRect();
      if (!cRect) return;
      const frameAtPointer = (ev.clientX - cRect.left) / zoomRef.current;
      applyTransitionDuration(editorApi, tr.id, Math.round(aEnd - frameAtPointer), false);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      editorApi.getState().commitPending();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const store = editorApi.getState();

    if (d.kind === 'trim') {
      // 3px 阈值：区分 roll 热区的点击（建转场）与真实拖拽（roll 编辑）
      if (!d.moved && Math.abs(e.clientX - d.startX) >= 3) d.moved = true;
      // roll 热区在越过阈值前不写 store：否则 sub-3px 抖动会先 commit:false 一次微 roll，
      // pointerup 时 addTransition 又读到这个已被污染的状态、commitPending 再补一条——
      // 一次点击炸出两条乱序 past。普通 trim（rollingNeighborId 为 null）不受影响。
      if (d.rollingNeighborId && !d.moved) return;
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
      // roll 热区点击（未越过拖拽阈值）且该切点尚无转场 ⇒ 建转场；真实拖拽（moved）仍按原逻辑提交 roll 编辑
      const bId = d.rollingNeighborId;
      if (bId && !d.moved) {
        const exists = Object.values(editorApi.getState().undoable.transitions ?? {}).some(
          (tr) => tr.fromItemId === d.id && tr.toItemId === bId,
        );
        if (!exists) addTransition(editorApi, d.id, bId);
      }
      editorApi.getState().commitPending();
    }
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-item-block]')) return;
    editorApi.getState().setSelected([]);
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
    void importFiles(editorApi, deps, files, undefined, { frame, trackId: undoable.tracks[trackIndex]?.id }, refs.getPlayerFrame());
  };

  // ---- 块右键菜单 ----

  /** 剪切 = 复制到内部剪贴板 + 删除选中（与 Cmd+X 一致） */
  const menuCut = () => {
    copySelection(editorApi);
    editorApi.getState().deleteSelected();
  };

  /** 置顶/置底：移到新建的最外层轨道（与画布右键菜单一致） */
  const menuReorder = (where: 'front' | 'back') => {
    const id = menuItemId.current;
    if (!id) return;
    editorApi
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
  if (virtualRowIndex !== null) {
    headerRows.splice(
      virtualRowIndex,
      0,
      <div key="__virtual" className="border-b border-border/50" style={{ height: TRACK_HEIGHT }} />,
    );
  }

  /** 吸附线（移动或修剪） */
  const guideFrame = moveVisual?.guideFrame ?? trimGuide;
  const movingItem = moveVisual ? undoable.items[moveVisual.id] : null;

  return (
    <div
      ref={panelRef}
      className={cn('relative shrink-0 border-t border-border bg-card', className)}
      style={{ height }}
    >
      <div
        className="absolute -top-1 left-0 right-0 z-30 h-2 cursor-ns-resize"
        onPointerDown={onResizePointerDown}
      />
      <TimelineToolbar
        fps={undoable.fps}
        duration={duration}
        snapping={snapping}
        splittable={splittable}
        zoom={zoom}
        zoomSetting={zoomSetting}
        fitZoom={fitZoom}
        setZoom={setZoom}
        onToggleSnapping={() => editorApi.getState().toggleSnapping()}
        onSplit={() => {
          const store = editorApi.getState();
          const f = refs.getPlayerFrame();
          store.updateUndoable((s) => splitItemsAtFrame(s, f, resolveSplitTargets(s, f, store.selectedItemIds)));
        }}
        onFit={() => {
          setZoom('fit');
          if (scrollRef.current) scrollRef.current.scrollLeft = 0;
        }}
      />
      <div className="flex overflow-y-auto" style={{ height: `calc(100% - 2rem)` }}>
        <div className="shrink-0 border-r border-border" style={{ width: HEADER_WIDTH }}>
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
                const store = editorApi.getState();
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
            <TimelineTracks
              tracks={undoable.tracks}
              items={undoable.items}
              transitions={transitions}
              rowHeights={rowHeights}
              zoom={zoom}
              moveVisualId={moveVisual?.id ?? null}
              selectedTransitionId={selectedTransitionId}
              onItemPointerDown={onItemPointerDown}
              onRollPointerDown={onRollPointerDown}
              onTransitionPointerDown={onTransitionPointerDown}
              virtualRowIndex={virtualRowIndex}
            />
            <Playhead zoom={zoom} onSeek={seekTo} />
            <TimelineOverlays
              undoable={undoable}
              zoom={zoom}
              tops={tops}
              rowHeights={rowHeights}
              moveVisual={moveVisual}
              movingItem={movingItem}
              guideFrame={guideFrame}
              trimming={trimming}
              dropHint={dropHint}
              marqueeRect={marqueeRect}
            />
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={menuCut}>{t('timeline.cut')}</ContextMenuItem>
              <ContextMenuItem onClick={() => copySelection(editorApi)}>{t('timeline.copy')}</ContextMenuItem>
              <ContextMenuItem onClick={() => duplicateSelection(editorApi)}>{t('timeline.duplicate')}</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => menuReorder('front')}>{t('timeline.bringToFront')}</ContextMenuItem>
              <ContextMenuItem onClick={() => menuReorder('back')}>{t('timeline.sendToBack')}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </div>
      <TimelineGhost zoom={zoom} moveVisual={moveVisual} movingItem={movingItem} />
    </div>
  );
};
