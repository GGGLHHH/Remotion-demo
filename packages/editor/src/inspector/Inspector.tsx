import type React from 'react'
import { useEditor } from '../state/context'
import { ItemPanel } from './panels'
import {
  CompositionPanel,
  CropSection,
  ExportSection,
  FadeSection,
  FillSection,
  GenerateCaptionsSection,
  LayoutSection,
  SourceSection,
  TransitionPanel,
} from './sections'

// 补丁 hook / 类型抽到 ./patch(打断 Inspector↔panels 循环依赖);此处 re-export 保持公开 API 位置不变。
export { type PatchFn, useItemPatch } from './patch'

/**
 * 注入槽(宿主放自定义控件,库自身不放内容 —— 不传时 DOM 与官方一致):
 *  - canvasExtra:检查器「画布」区末尾(如尺寸预设)
 *  - exportExtra:「导出」区末尾、渲染任务列表之后(如渲染产物的持久历史)
 */
export const Inspector: React.FC<{
  className?: string
  canvasExtra?: React.ReactNode
  exportExtra?: React.ReactNode
}> = ({ className, canvasExtra, exportExtra }) => {
  const selectedItemIds = useEditor(s => s.selectedItemIds)
  const selectedTransitionId = useEditor(s => s.selectedTransitionId)
  const items = useEditor(s => s.undoable.items)

  // filter(Boolean) 不窄化类型,显式比较才会 —— 选中集里可能有已删掉的 id
  const selected = selectedItemIds.map(id => items[id]).filter(it => it !== undefined)

  const content = selectedTransitionId != null && selectedTransitionId !== ''
    ? <TransitionPanel id={selectedTransitionId} />
    : selected.length === 0
      ? <CompositionPanel canvasExtra={canvasExtra} exportExtra={exportExtra} />
      // 官方行为：多选时面板完全留空
      : selected.length > 1
        ? null
      // key=item.id：切换选中时重挂，重置锁比例/折叠等本地状态
        : <ItemPanel key={selected[0].id} item={selected[0]} />

  // 无 className（EditorRoot preset 用外层 aside 控宽）→ 直接返回内容，DOM 不变；
  // 传 className（自拼布局的宿主）→ 包一层带样式的容器，空/多选时也保持列宽。
  return (className != null && className !== '') ? <div className={className}>{content}</div> : content
}

/**
 * 检查器 section 积木:宿主可绕开成品 Inspector,自行拼装面板(配合 useItemPatch)。
 *  成品 Inspector = 官方默认拼法,这些导出不改变其行为。
 */
export const InspectorSections = {
  Composition: CompositionPanel,
  Item: ItemPanel,
  Source: SourceSection,
  Layout: LayoutSection,
  Fill: FillSection,
  Crop: CropSection,
  Fade: FadeSection,
  Captions: GenerateCaptionsSection,
  Export: ExportSection,
} as const
