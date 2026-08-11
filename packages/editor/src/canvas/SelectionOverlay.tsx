import type { EditorStarterItem } from '@gedatou/shared'
import type React from 'react'
import { findGroupOfItem } from '@gedatou/shared'
import { useRef } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../components/ui/context-menu'
import { copySelection, duplicateSelection } from '../lib/clipboard'
import { useT } from '../lib/i18n'
import { useEditor, useEditorApi, useEditorRefs } from '../state/context'
import { addTrack, moveItems, removeEmptyTracks } from '../timeline/ops'
import { topmostItemAt, toStagePoint } from './geometry'
import { CORNERS, EDGES, SizeBadge } from './handle-primitives'
import { usePlayerFrameDerived } from './player-ref'
import { useSelectionDrag } from './use-selection-drag'

/** item 在 f 帧是否上画布（音频不可见） */
function visibleAt(it: EditorStarterItem | undefined, f: number): boolean {
  return Boolean(it && it.type !== 'audio' && f >= it.from && it.from + it.durationInFrames > f)
}

export const SelectionOverlay: React.FC<{ scale: number }> = ({ scale }) => {
  const t = useT()
  const editorApi = useEditorApi()
  const refs = useEditorRefs()
  const undoable = useEditor(s => s.undoable)
  const selectedItemIds = useEditor(s => s.selectedItemIds)
  const snappingEnabled = useEditor(s => s.snappingEnabled)
  const editingId = useEditor(s => s.textItemEditing)
  // 选择框拖拽状态机(move/resize/marquee)+ 悬停描边 + 吸附辅助线,见 useSelectionDrag
  const { marquee, guides, hoverId, setHoverId, onBackgroundPointerDown, onHandlePointerDown, onPointerMove, onPointerUp }
    = useSelectionDrag({ editorApi, refs, scale, snappingEnabled })
  /** 右键命中的 item（菜单动作目标）；菜单开合由 ContextMenu 组件管理 */
  const menuItemIdRef = useRef<string | null>(null)

  // 播放头帧：渲染时直接读（不进 state）；派生订阅只在所选/悬停项进出当前帧时触发重渲，
  // 播放期间无选中/悬停 ⇒ 零重渲（性能关键路径）
  const frame = refs.getPlayerFrame()
  usePlayerFrameDerived((f) => {
    let key = (hoverId != null && hoverId !== '') && visibleAt(undoable.items[hoverId], f) ? 'H' : 'h'
    for (const id of selectedItemIds) key += visibleAt(undoable.items[id], f) ? '1' : '0'
    return key
  })

  const toComp = (e: React.MouseEvent): { x: number, y: number } =>
    toStagePoint((e.currentTarget as HTMLElement).closest('[data-stage]')!, e.clientX, e.clientY, scale)

  const onDoubleClick = (e: React.MouseEvent): void => {
    const store = editorApi.getState()
    const { x, y } = toComp(e)
    const hit = topmostItemAt(store.undoable, refs.getPlayerFrame(), x, y)
    if (!hit)
      return
    if (hit.type === 'text')
      store.setTextItemEditing(hit.id)
    else if (hit.type === 'video' || hit.type === 'image')
      store.setItemSelectedForCrop(hit.id)
  }

  /** 置顶/置底：移到新建的最上/最下轨道，再清理空轨道 */
  const reorder = (where: 'front' | 'back'): void => {
    const itemId = menuItemIdRef.current
    if (!(itemId != null && itemId !== ''))
      return
    const store = editorApi.getState()
    store.updateUndoable((s) => {
      const item = s.items[itemId]
      if (!item)
        return s
      const { state: st, trackId } = addTrack(s, where === 'front' ? 0 : s.tracks.length)
      const moved = moveItems(st, [{ id: itemId, trackId, from: item.from }])
      if (moved === st)
        return s
      return removeEmptyTracks(moved)
    })
  }

  /** 剪切 = 复制到内部剪贴板 + 删除选中（与 Cmd+X 一致） */
  const cutSelection = (): void => {
    copySelection(editorApi)
    editorApi.getState().deleteSelected()
  }

  const selectedVisible = selectedItemIds
    .map(id => undoable.items[id])
    .filter((it): it is EditorStarterItem => it !== undefined && it.type !== 'audio')
    .filter(it => frame >= it.from && it.from + it.durationInFrames > frame)
    // 行内编辑中的项不显示选择框/手柄/徽章（textarea 自带边框）
    .filter(it => it.id !== editingId)

  const single = selectedVisible.length === 1 ? selectedVisible[0] : null

  // 组包围盒:选中可见项按所属组归拢,每个 ≥2 成员的组画一个轴对齐虚线框(仅视觉,无手柄)
  const groupBoxes: { id: string, left: number, top: number, width: number, height: number }[] = []
  {
    const byGroup = new Map<string, EditorStarterItem[]>()
    for (const it of selectedVisible) {
      const g = findGroupOfItem(undoable.groups, it.id)
      if (!g)
        continue
      const arr = byGroup.get(g.id) ?? []
      arr.push(it)
      byGroup.set(g.id, arr)
    }
    for (const [gid, members] of byGroup) {
      if (members.length < 2)
        continue
      const left = Math.min(...members.map(m => m.left))
      const top = Math.min(...members.map(m => m.top))
      const right = Math.max(...members.map(m => m.left + m.width))
      const bottom = Math.max(...members.map(m => m.top + m.height))
      groupBoxes.push({ id: gid, left, top, width: right - left, height: bottom - top })
    }
  }
  const canGroup = selectedItemIds.length >= 2
  const canUngroup = selectedItemIds.some(id => findGroupOfItem(undoable.groups, id))

  const hoverItem
    = (hoverId != null && hoverId !== '') && !selectedItemIds.includes(hoverId) ? (undoable.items[hoverId] ?? null) : null
  const hoverVisible
    = hoverItem
      && hoverItem.type !== 'audio'
      && frame >= hoverItem.from
      && hoverItem.from + hoverItem.durationInFrames > frame
      ? hoverItem
      : null

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="absolute inset-0"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHoverId(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          // 仅在命中 item 时弹菜单；空白处右键既不弹菜单也不弹系统菜单
          const store = editorApi.getState()
          const { x, y } = toComp(e)
          const hit = topmostItemAt(store.undoable, refs.getPlayerFrame(), x, y)
          if (!hit) {
            e.preventDefault()
            e.preventBaseUIHandler()
            return
          }
          // 右键先选中：已在多选中则保持多选，否则只选命中项
          store.setSelected(
            store.selectedItemIds.includes(hit.id) ? store.selectedItemIds : [hit.id],
          )
          menuItemIdRef.current = hit.id
        }}
      >
        {hoverVisible
          ? (
              <div
                className="
                  pointer-events-none absolute border-2 border-blue-500
                "
                style={{
                  left: hoverVisible.left * scale,
                  top: hoverVisible.top * scale,
                  width: hoverVisible.width * scale,
                  height: hoverVisible.height * scale,
                  rotate: `${hoverVisible.rotation}deg`,
                }}
              />
            )
          : null}
        {selectedVisible.map(item => (
          <div
            key={item.id}
            className="pointer-events-none absolute border-2 border-blue-500"
            style={{
              left: item.left * scale,
              top: item.top * scale,
              width: item.width * scale,
              height: item.height * scale,
              rotate: `${item.rotation}deg`,
            }}
          >
            {single?.id === item.id
              ? (
                  <>
                    {EDGES.map(({ handle, cursor, style }) => (
                      <div
                        key={handle}
                        onPointerDown={e => onHandlePointerDown(e, item, handle)}
                        className="pointer-events-auto absolute"
                        style={{ ...style, cursor }}
                      />
                    ))}
                    {CORNERS.map(({ handle, x, y, cursor }) => (
                      <div
                        key={handle}
                        onPointerDown={e => onHandlePointerDown(e, item, handle)}
                        className="
                          pointer-events-auto absolute border border-[#0B84F3]
                          bg-white block-2 inline-2
                        "
                        style={{ left: `calc(${x * 100}% - 4px)`, top: `calc(${y * 100}% - 4px)`, cursor }}
                      />
                    ))}
                  </>
                )
              : null}
            <SizeBadge width={item.width} height={item.height} />
          </div>
        ))}
        {groupBoxes.map(b => (
          <div
            key={b.id}
            className="
              pointer-events-none absolute rounded-sm border border-dashed
              border-sky-400/70
            "
            style={{
              left: b.left * scale - 3,
              top: b.top * scale - 3,
              width: b.width * scale + 6,
              height: b.height * scale + 6,
            }}
          />
        ))}
        {guides.map(g => (
          <div
            key={`${g.axis}-${g.pos}`}
            className="pointer-events-none absolute bg-fuchsia-500"
            style={
              g.axis === 'x'
                ? { left: g.pos * scale, top: 0, bottom: 0, width: 1 }
                : { top: g.pos * scale, left: 0, right: 0, height: 1 }
            }
          />
        ))}
        {marquee
          ? (
              <div
                className="
                  pointer-events-none absolute border border-[#0B84F3]
                  bg-[#0B84F3]/10
                "
                style={{
                  left: marquee.x * scale,
                  top: marquee.y * scale,
                  width: marquee.w * scale,
                  height: marquee.h * scale,
                }}
              />
            )
          : null}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={cutSelection}>{t('selectionOverlay.cut')}</ContextMenuItem>
        <ContextMenuItem onClick={() => copySelection(editorApi)}>{t('selectionOverlay.copy')}</ContextMenuItem>
        <ContextMenuItem onClick={() => duplicateSelection(editorApi)}>{t('selectionOverlay.duplicate')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => reorder('front')}>{t('selectionOverlay.bringToFront')}</ContextMenuItem>
        <ContextMenuItem onClick={() => reorder('back')}>{t('selectionOverlay.sendToBack')}</ContextMenuItem>
        {canGroup || canUngroup ? <ContextMenuSeparator /> : null}
        {canGroup
          ? (
              <ContextMenuItem onClick={() => editorApi.getState().groupSelected()}>
                {t('selectionOverlay.group')}
              </ContextMenuItem>
            )
          : null}
        {canUngroup
          ? (
              <ContextMenuItem onClick={() => editorApi.getState().ungroupSelected()}>
                {t('selectionOverlay.ungroup')}
              </ContextMenuItem>
            )
          : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
