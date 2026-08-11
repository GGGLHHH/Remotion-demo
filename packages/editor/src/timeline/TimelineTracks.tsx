import type { EditorStarterItem, ItemDict, Track, Transition, TransitionDict } from '@gedatou/shared'
import type React from 'react'
import { dictValues } from '@gedatou/shared'
import { Plus } from 'lucide-react'
import { useT } from '#lib/i18n'
import { cn } from '#lib/utils'
import { TRACK_HEIGHT } from './constants'
import { ItemBlock } from './ItemBlock'

// 时间线轨道行(每轨:块 + 相邻块间的 roll 热区/建转场徽章 + 已存在转场 pill)。纯展示 + 事件回调透传,
// 无自身状态。虚拟空行(拖到顶/底新建轨道的落点提示)在 virtualRowIndex 处就地 splice。从 TimelinePanel 搬出。
export const TimelineTracks: React.FC<{
  tracks: Track[]
  items: ItemDict
  transitions: TransitionDict
  rowHeights: number[]
  zoom: number
  moveVisualId: string | null
  selectedTransitionId: string | null
  onItemPointerDown: React.ComponentProps<typeof ItemBlock>['onPointerDown']
  onRollPointerDown: (e: React.PointerEvent, aId: string, bId: string) => void
  onTransitionPointerDown: (e: React.PointerEvent, tr: Transition, a: EditorStarterItem) => void
  virtualRowIndex: number | null
}> = ({
  tracks,
  items,
  transitions,
  rowHeights,
  zoom,
  moveVisualId,
  selectedTransitionId,
  onItemPointerDown,
  onRollPointerDown,
  onTransitionPointerDown,
  virtualRowIndex,
}) => {
  const t = useT()
  const laneRows = tracks.map((track, ti) => {
    const rowItems = dictValues(items).filter(i => i.trackId === track.id)
    const rowTransitions = dictValues(transitions).filter(tr => tr.trackId === track.id)
    return (
      <div key={track.id} className="relative border-be border-border/50" style={{ height: rowHeights[ti] }}>
        {rowItems.map(item => (
          <ItemBlock
            key={item.id}
            item={item}
            zoom={zoom}
            hidden={moveVisualId === item.id}
            onPointerDown={onItemPointerDown}
          />
        ))}
        {/* 帧级相邻的两块边界：4px 滚动编辑热区（压在两侧修剪手柄之上）+ 建转场 '+' 徽章。
            徽章纯装饰（永远 pointer-events-none，仅 group-hover 现身）：真正的点击建转场
            落在 roll 热区自身——onRollPointerDown 按下、pointerup 时按"是否越过拖拽阈值"
            区分点击（建转场）与拖拽（roll 编辑），见 onPointerUp */}
        {rowItems.flatMap((a) => {
          const b = rowItems.find(o => o.from === a.from + a.durationInFrames)
          if (!b)
            return []
          // 一旦存在转场，B 会左移形成重叠，此处的精确相邻不再成立——这里已隐含"无转场"；
          // 仍显式核对一次（防御性，对齐 op 层的真源判断）
          const hasTransition = rowTransitions.some(tr => tr.fromItemId === a.id && tr.toItemId === b.id)
          return [
            <div
              key={`roll-${a.id}`}
              data-roll
              className="
                group absolute inset-y-1.5 z-40 cursor-ew-resize inline-1
              "
              style={{ left: b.from * zoom - 2 }}
              title={!hasTransition ? t('timeline.addTransition') : undefined}
              onPointerDown={e => onRollPointerDown(e, a.id, b.id)}
            >
              {!hasTransition
                ? (
                    <div
                      data-add-transition
                      aria-hidden="true"
                      className="
                        pointer-events-none absolute inset-s-1/2 inset-bs-1/2
                        z-40 flex -translate-1/2 items-center justify-center
                        rounded-full border border-white/60 bg-black/90
                        text-white opacity-0 transition-opacity block-3.5
                        inline-3.5
                        group-hover:opacity-100
                      "
                    >
                      <Plus className="block-2.5 inline-2.5" />
                    </div>
                  )
                : null}
            </div>,
          ]
        })}
        {/* 已存在的转场：填充 pill 覆盖重叠区（左缘=B.from，右缘=A 出点）；
            pointerdown 选中 + 启动调时长拖拽（stopPropagation，不触碰块 move / roll 手势） */}
        {rowTransitions.flatMap((tr) => {
          const a = items[tr.fromItemId]
          const b = items[tr.toItemId]
          if (!a || !b)
            return []
          const left = b.from * zoom
          const width = Math.max(4, (a.from + a.durationInFrames - b.from) * zoom)
          return [
            <div
              key={`transition-${tr.id}`}
              data-transition={tr.id}
              className={cn(
                `
                  absolute inset-y-1.5 z-40 cursor-ew-resize rounded-sm
                  bg-white/25 ring-1 ring-white/50 ring-inset
                  hover:bg-white/35
                `,
                selectedTransitionId === tr.id && 'ring-2 ring-[#0B84F3]',
              )}
              style={{ left, width }}
              title={t('timeline.transition')}
              onPointerDown={e => onTransitionPointerDown(e, tr, a)}
            />,
          ]
        })}
      </div>
    )
  })
  if (virtualRowIndex !== null) {
    laneRows.splice(
      virtualRowIndex,
      0,
      <div
        key="__virtual"
        className="relative border-be border-border/50 bg-muted/30"
        style={{ height: TRACK_HEIGHT }}
      />,
    )
  }
  return <>{laneRows}</>
}
