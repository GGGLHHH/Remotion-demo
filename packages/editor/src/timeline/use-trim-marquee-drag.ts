import type { EditorStarterItem } from '@gedatou/shared'
import type React from 'react'
import type { EditorStoreApi } from '#state/store'
import type { DragState } from './types'
import { dictValues } from '@gedatou/shared'
import { useRef, useState } from 'react'
import { addTransition } from '#lib/transition-ops'
import { trackIndexAtY } from './geometry'
import { rollEdit, snapFrame, trimItem } from './ops'

/** 修剪吸附阈值（官方约 10px） */
const TRIM_SNAP_PX = 10

interface TrimMarqueeDrag {
  /** 修剪拖拽中的项（用于最大可扩展指示） */
  trimming: { id: string, edge: 'start' | 'end' } | null
  /** 修剪吸附线（帧） */
  trimGuide: number | null
  /** 框选矩形（内容层坐标），非框选态为 null */
  marqueeRect: { x: number, y: number, w: number, h: number } | null
  startTrim: (e: React.PointerEvent, item: EditorStarterItem, edge: 'start' | 'end') => void
  startRoll: (e: React.PointerEvent, aId: string, bId: string) => void
  startMarquee: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
}

// 时间线「修剪 / roll 编辑 / 框选」拖拽状态机:三者共享一个 dragRef ref(判别联合),故整体收进一个 hook。
// 从 TimelinePanel 原样搬出。入口 startTrim/startRoll/startMarquee 分别由修剪手柄/roll 热区/背景 pointerdown 调用;
// onPointerMove/onPointerUp 挂到内容层 DOM。zoom/snapping 每渲染传入(闭包捕获当前值)。
export function useTrimMarqueeDrag(deps: {
  editorApi: EditorStoreApi
  scrollRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  snapping: boolean
}): TrimMarqueeDrag {
  const { editorApi, scrollRef, zoom, snapping } = deps
  const dragRef = useRef<DragState | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null)
  /** 修剪拖拽中的项（用于最大可扩展指示） */
  const [trimming, setTrimming] = useState<{ id: string, edge: 'start' | 'end' } | null>(null)
  /** 修剪吸附线（帧） */
  const [trimGuide, setTrimGuide] = useState<number | null>(null)

  /** 修剪手柄按下：立即独占选中该项 + 记录快照,进入 trim 拖拽（pointerCapture 由调用方在分发前已做） */
  const startTrim = (e: React.PointerEvent, item: EditorStarterItem, edge: 'start' | 'end'): void => {
    const store = editorApi.getState()
    // 官方：按下修剪手柄立即独占选中该项（mousedown 即生效，无需移动）
    store.setSelected([item.id])
    dragRef.current = {
      kind: 'trim',
      edge,
      id: item.id,
      startX: e.clientX,
      snapshot: store.undoable,
      rollingNeighborId: null,
      moved: false,
    }
    setTrimming({ id: item.id, edge })
  }

  /** 相邻块边界滚动编辑（官方：4px ew-resize 热区，无需修饰键）：A 出点 + B 入点联动 */
  const startRoll = (e: React.PointerEvent, aId: string, bId: string): void => {
    if (e.button !== 0)
      return
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      kind: 'trim',
      edge: 'end',
      id: aId,
      startX: e.clientX,
      snapshot: editorApi.getState().undoable,
      rollingNeighborId: bId,
      moved: false,
    }
  }

  /** 背景 pointerdown：清空选中 + 进入框选 */
  const startMarquee = (e: React.PointerEvent): void => {
    if (e.button !== 0)
      return
    if ((e.target as HTMLElement).closest('[data-item-block]'))
      return
    editorApi.getState().setSelected([])
    dragRef.current = { kind: 'marquee', startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragRef.current
    if (!d)
      return
    const store = editorApi.getState()

    if (d.kind === 'trim') {
      // 3px 阈值：区分 roll 热区的点击（建转场）与真实拖拽（roll 编辑）
      if (!d.moved && Math.abs(e.clientX - d.startX) >= 3)
        d.moved = true
      // roll 热区在越过阈值前不写 store：否则 sub-3px 抖动会先 commit:false 一次微 roll，
      // pointerup 时 addTransition 又读到这个已被污染的状态、commitPending 再补一条——
      // 一次点击炸出两条乱序 past。普通 trim（rollingNeighborId 为 null）不受影响。
      if ((d.rollingNeighborId != null && d.rollingNeighborId !== '') && !d.moved)
        return
      // 官方：按住 Shift 完全抑制修剪（边缘回到起拖位置，松开恢复）
      if (e.shiftKey) {
        setTrimGuide(null)
        store.updateUndoable(() => d.snapshot, { commit: false })
        return
      }
      let delta = Math.round((e.clientX - d.startX) / zoom)
      const orig = d.snapshot.items[d.id]
      let guide: number | null = null
      if (snapping && orig) {
        // 修剪吸附（官方约 10px 阈值）：以被拖的边缘为准；播放头不是修剪吸附目标
        const tol = Math.max(1, Math.round(TRIM_SNAP_PX / zoom))
        const edgeFrame = d.edge === 'start' ? orig.from + delta : orig.from + orig.durationInFrames + delta
        const ignoreIds = (d.rollingNeighborId != null && d.rollingNeighborId !== '') ? [d.id, d.rollingNeighborId] : [d.id]
        const snapped = snapFrame(d.snapshot, edgeFrame, tol, { ignoreIds })
        if (snapped !== edgeFrame) {
          delta += snapped - edgeFrame
          guide = snapped
        }
      }
      setTrimGuide(guide)
      store.updateUndoable(
        () =>
          (d.rollingNeighborId != null && d.rollingNeighborId !== '')
            ? rollEdit(d.snapshot, d.id, d.rollingNeighborId, delta)
            : trimItem(d.snapshot, d.id, d.edge, delta),
        { commit: false },
      )
      return
    }

    // marquee
    d.curX = e.clientX
    d.curY = e.clientY
    const host = scrollRef.current!.getBoundingClientRect()
    const x1 = Math.min(d.startX, d.curX) - host.left + scrollRef.current!.scrollLeft
    const x2 = Math.max(d.startX, d.curX) - host.left + scrollRef.current!.scrollLeft
    const y1 = Math.min(d.startY, d.curY) - host.top
    const y2 = Math.max(d.startY, d.curY) - host.top
    setMarqueeRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
    // 命中：帧区间 × 轨道行相交
    const f1 = x1 / zoom
    const f2 = x2 / zoom
    const r1 = trackIndexAtY(store.undoable, y1)
    const r2 = trackIndexAtY(store.undoable, y2)
    const hit: string[] = []
    for (const item of dictValues(store.undoable.items)) {
      const idx = store.undoable.tracks.findIndex(t => t.id === item.trackId)
      if (idx < r1 || idx > r2)
        continue
      if (item.from < f2 && f1 < item.from + item.durationInFrames)
        hit.push(item.id)
    }
    store.setSelected(hit)
  }

  const onPointerUp = (): void => {
    const d = dragRef.current
    dragRef.current = null
    setMarqueeRect(null)
    setTrimming(null)
    setTrimGuide(null)
    if (!d)
      return
    if (d.kind === 'trim') {
      // roll 热区点击（未越过拖拽阈值）且该切点尚无转场 ⇒ 建转场；真实拖拽（moved）仍按原逻辑提交 roll 编辑
      const bId = d.rollingNeighborId
      if ((bId != null && bId !== '') && !d.moved) {
        const exists = dictValues(editorApi.getState().undoable.transitions ?? {}).some(
          tr => tr.fromItemId === d.id && tr.toItemId === bId,
        )
        if (!exists)
          addTransition(editorApi, d.id, bId)
      }
      editorApi.getState().commitPending()
    }
  }

  return { trimming, trimGuide, marqueeRect, startTrim, startRoll, startMarquee, onPointerMove, onPointerUp }
}
