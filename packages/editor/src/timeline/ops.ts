import type { CaptionsItem, EditorStarterItem, TransitionDict, UndoableState } from '@gedatou/shared'
import { addItemToItemsGroup, createCaptionAsset, createTrack, dictEntries, dictValues, shiftCaptions } from '@gedatou/shared'

/**
 * 移动块 ⇒ 断开它参与的转场（Premiere 式：转场附着在两块的编辑点上，块一走这个点就不存在了）。
 * 只删记录，两块位置各归各的 —— 对侧不跟随，被拖块落在光标处。无涉及则返回原引用，免无谓写。
 */
export function detachTransitionsOf(transitions: TransitionDict, itemId: string): TransitionDict {
  const ids = dictEntries(transitions)
    .filter(([, t]) => t.fromItemId === itemId || t.toItemId === itemId)
    .map(([k]) => k)
  if (!ids.length)
    return transitions
  const next = { ...transitions }
  for (const id of ids) delete next[id]
  return next
}

/** 媒体类 item（有 trimBefore/playbackRate） */
function isMediaItem(item: EditorStarterItem): item is Extract<EditorStarterItem, { trimBefore: number }> {
  return item.type === 'video' || item.type === 'audio' || item.type === 'gif'
}

/** 素材总长（帧，素材原速） */
function assetDurationInFrames(state: UndoableState, item: EditorStarterItem): number | null {
  if (!isMediaItem(item))
    return null
  const asset = state.assets[item.assetId]
  if (!asset || !('durationInSeconds' in asset))
    return null
  return Math.floor(asset.durationInSeconds * state.fps)
}

/** 媒体项在时间轴上的最大可用时长（按 playbackRate 换算）；非媒体项 null */
export function maxItemDurationInFrames(state: UndoableState, id: string): number | null {
  const item = state.items[id]
  if (!item)
    return null
  if (item.type === 'gif')
    return null // gif 循环播放，不受素材时长限制
  const total = assetDurationInFrames(state, item)
  if (total === null || !isMediaItem(item))
    return null
  return Math.floor((total - item.trimBefore) / item.playbackRate)
}

/** 修剪拖拽时的最大可扩展指示：有限媒体（video/audio）左右各还能扩展多少帧 */
export function maxExtendFrames(state: UndoableState, id: string): { left: number, right: number } | null {
  const item = state.items[id]
  if (!item || (item.type !== 'video' && item.type !== 'audio'))
    return null
  const maxDur = maxItemDurationInFrames(state, id)
  if (maxDur === null)
    return null
  return {
    // 左侧：素材已修剪掉的部分（换算到时间轴帧），且不能早于 0 帧
    left: Math.min(Math.floor(item.trimBefore / item.playbackRate), item.from),
    right: Math.max(0, maxDur - item.durationInFrames),
  }
}

export function hasOverlap(state: UndoableState, trackId: string, from: number, durationInFrames: number, ignoreIds: string[]): boolean {
  const end = from + durationInFrames
  for (const item of dictValues(state.items)) {
    if (item.trackId !== trackId || ignoreIds.includes(item.id))
      continue
    if (from < item.from + item.durationInFrames && item.from < end)
      return true
  }
  return false
}

export function moveItems(state: UndoableState, moves: { id: string, trackId: string, from: number }[]): UndoableState {
  if (moves.length === 0)
    return state
  const movedIds = moves.map(m => m.id)
  // 校验：负 from、轨道存在、与未移动项冲突、移动项之间冲突
  for (const move of moves) {
    const item = state.items[move.id]
    if (!item)
      return state
    if (move.from < 0)
      return state
    if (!state.tracks.some(t => t.id === move.trackId))
      return state
    if (hasOverlap(state, move.trackId, move.from, item.durationInFrames, movedIds))
      return state
  }
  for (let i = 0; i < moves.length; i++) {
    for (let j = i + 1; j < moves.length; j++) {
      const a = moves[i]
      const b = moves[j]
      if (a.trackId !== b.trackId)
        continue
      const ia = state.items[a.id]
      const ib = state.items[b.id]
      // 两边都得在场才谈得上重叠;移动列表里指向已删块的条目直接跳过
      if (!ia || !ib)
        continue
      if (a.from < b.from + ib.durationInFrames && b.from < a.from + ia.durationInFrames)
        return state
    }
  }
  const items = { ...state.items }
  for (const move of moves) {
    const it = items[move.id]
    if (it)
      items[move.id] = { ...it, trackId: move.trackId, from: move.from }
  }
  return { ...state, items }
}

/** 移动拖拽的目标轨道：现有轨道 / 在 index 处插入的新轨道 */
export type MoveTrackRef = { kind: 'existing', id: string } | { kind: 'insert', index: number }

/**
 * 移动落点（以光标位置为主，最小扰动）：
 * - 决策块 pivot = 光标(cursorFrom)点命中的那个块（块互不重叠 ⇒ 至多一个）。
 * - 光标不在任何块上 ⇒ 自由落位:停在被拖块左缘 leftFrom（保留抓取偏移、留空隙）。
 * - 光标在 pivot 左半 ⇒ 紧贴其左缘插到前;右半 ⇒ 紧贴其右缘插到后。
 * - 优先填 pivot 该侧现成空位、pivot 不动;空位不够才把 pivot（及其后）最小量级联右推。
 * 返回落点 from 与其他块新起帧（shifts，仅含实际移动者）。
 */
export function resolveInsertPlacement(state: UndoableState, itemId: string, cursorFrom: number, leftFrom: number, targetTrack: MoveTrackRef): { from: number, shifts: Record<string, number> } {
  const item = state.items[itemId]
  const left = Math.max(0, Math.round(leftFrom))
  // 新插入的轨道必然为空 ⇒ 无重排,左缘钳帧落位
  if (!item || targetTrack.kind === 'insert')
    return { from: left, shifts: {} }
  const dur = item.durationInFrames
  const cursor = Math.round(cursorFrom)
  const others = dictValues(state.items)
    .filter(o => o.trackId === targetTrack.id && o.id !== itemId)
    .sort((a, b) => a.from - b.from)
  const endOf = (o: EditorStarterItem): number => o.from + o.durationInFrames
  // 决策块 = 光标点命中的块;命中不到 ⇒ 自由落位(停在左缘)
  const pivot = others.find(o => o.from <= cursor && cursor < endOf(o))
  let from: number
  if (!pivot) {
    from = left
  }
  else if (cursor < pivot.from + pivot.durationInFrames / 2) {
    // 光标在 pivot 左半 ⇒ 紧贴其左缘;左邻居与 pivot 之间空位不够时下面级联会把 pivot 右推
    const prevEnd = others.reduce((m, o) => (endOf(o) <= pivot.from ? Math.max(m, endOf(o)) : m), 0)
    from = Math.max(pivot.from - dur, prevEnd)
  }
  else {
    from = endOf(pivot) // 光标在 pivot 右半 ⇒ 紧贴其右缘
  }
  // 级联右推:被拖块右侧、会与其(或被顶链)重叠的块顺延;空隙够就不动。完全在左侧的块不受影响。
  const shifts: Record<string, number> = {}
  let next = from + dur
  for (const o of others) {
    if (endOf(o) <= from)
      continue
    const newFrom = Math.max(o.from, next)
    if (newFrom !== o.from)
      shifts[o.id] = newFrom
    next = newFrom + o.durationInFrames
  }
  return { from, shifts }
}

/**
 * 源块被 trim ⇒ 绑定它的字幕跟着裁。delta 已被 trimItem 钳制过，语义与源块一致：
 * start 边 `from += delta / 时长 -= delta`，end 边 `时长 += delta`。
 *
 * 左侧多一步：块头右移了，内容得整体前移同样多，否则字幕比画面晚一拍。
 * 被移到负时间的条目**不删** —— 渲染器只取 startMs <= 当前时间且未过期的页，负的自然不出现；
 * 留着它，边缘拉回来时字幕原样回来，trim 因此是无损的。
 */
function trimBoundCaptions(state: UndoableState, srcId: string, edge: 'start' | 'end', delta: number): UndoableState {
  const bound = dictValues(state.items).filter(
    (o): o is CaptionsItem => o.type === 'captions' && o.sourceItemId === srcId,
  )
  if (!bound.length)
    return state
  const items = { ...state.items }
  const assets = { ...state.assets }
  const shiftMs = (delta / state.fps) * 1000
  for (const cap of bound) {
    if (edge === 'end') {
      items[cap.id] = { ...cap, durationInFrames: Math.max(1, cap.durationInFrames + delta) }
      continue
    }
    items[cap.id] = {
      ...cap,
      from: cap.from + delta,
      durationInFrames: Math.max(1, cap.durationInFrames - delta),
    }
    const asset = assets[cap.assetId]
    if (asset?.type !== 'caption')
      continue
    assets[cap.assetId] = { ...asset, captions: shiftCaptions(asset.captions, shiftMs) }
  }
  return { ...state, items, assets }
}

export function trimItem(state: UndoableState, id: string, edge: 'start' | 'end', deltaFrames: number): UndoableState {
  const item = state.items[id]
  if (!item || deltaFrames === 0)
    return state

  if (edge === 'start') {
    let delta = deltaFrames
    // 不能把时长修剪到 < 1
    delta = Math.min(delta, item.durationInFrames - 1)
    // 不能早于 0 帧
    delta = Math.max(delta, -item.from)
    // 媒体项：不能露出素材开头之前
    if (isMediaItem(item)) {
      delta = Math.max(delta, -Math.floor(item.trimBefore / item.playbackRate))
    }
    // 不与左邻居重叠
    let leftBound = 0
    for (const other of dictValues(state.items)) {
      if (other.trackId !== item.trackId || other.id === id)
        continue
      const otherEnd = other.from + other.durationInFrames
      if (otherEnd <= item.from)
        leftBound = Math.max(leftBound, otherEnd)
    }
    delta = Math.max(delta, leftBound - item.from)
    if (delta === 0)
      return state
    const next: EditorStarterItem = {
      ...item,
      from: item.from + delta,
      durationInFrames: item.durationInFrames - delta,
    }
    if (isMediaItem(next) && isMediaItem(item)) {
      next.trimBefore = Math.max(0, item.trimBefore + Math.round(delta * item.playbackRate))
    }
    return trimBoundCaptions({ ...state, items: { ...state.items, [id]: next } }, id, 'start', delta)
  }

  // end
  let delta = deltaFrames
  delta = Math.max(delta, 1 - item.durationInFrames) // 最小 1
  const maxDur = maxItemDurationInFrames(state, id)
  if (maxDur !== null) {
    delta = Math.min(delta, maxDur - item.durationInFrames)
  }
  // 不与右邻居重叠
  let rightBound = Infinity
  for (const other of dictValues(state.items)) {
    if (other.trackId !== item.trackId || other.id === id)
      continue
    if (other.from >= item.from + item.durationInFrames) {
      rightBound = Math.min(rightBound, other.from)
    }
  }
  delta = Math.min(delta, rightBound - item.from - item.durationInFrames)
  if (delta === 0)
    return state
  return trimBoundCaptions(
    {
      ...state,
      items: {
        ...state.items,
        [id]: { ...item, durationInFrames: item.durationInFrames + delta },
      },
    },
    id,
    'end',
    delta,
  )
}

/**
 * 滚动编辑（官方：相邻块边界 4px 热区）：A 的出点与 B 的入点同步移动，B 的结尾不动。
 * 钳制：双方各保 >= 1 帧；A 扩展不超素材末尾；B 入点左移不早于素材开头。
 * 先钳出双方都能接受的同一 delta，再按"收缩侧先算"应用，保证无缝无叠。
 */
export function rollEdit(state: UndoableState, aId: string, bId: string, deltaFrames: number): UndoableState {
  const a = state.items[aId]
  const b = state.items[bId]
  if (!a || !b || deltaFrames === 0)
    return state
  let delta = deltaFrames
  delta = Math.max(delta, 1 - a.durationInFrames)
  delta = Math.min(delta, b.durationInFrames - 1)
  const maxA = maxItemDurationInFrames(state, aId)
  if (maxA !== null)
    delta = Math.min(delta, maxA - a.durationInFrames)
  if (isMediaItem(b))
    delta = Math.max(delta, -Math.floor(b.trimBefore / b.playbackRate))
  if (delta === 0)
    return state
  if (delta > 0) {
    // B 先右移入点腾位，A 再扩展
    return trimItem(trimItem(state, bId, 'start', delta), aId, 'end', delta)
  }
  // A 先收缩，B 再左移入点补位
  return trimItem(trimItem(state, aId, 'end', delta), bId, 'start', delta)
}

export function splitItemsAtFrame(state: UndoableState, frame: number, itemIds: string[]): UndoableState {
  let changed = false
  const items = { ...state.items }
  const assets = { ...state.assets }
  // 切源块 ⇒ 绑定它的字幕也要在同一处切开，否则右半素材没字幕、而左半字幕横跨切口。
  // 加进待切列表即可：下面的循环会给右半字幕改 sourceItemId 指向右半源。
  // 非字幕块排前面：右半字幕要绑右半源，得等源先切出来。
  const targets = [
    ...itemIds.filter(id => items[id]?.type !== 'captions'),
    ...itemIds.filter(id => items[id]?.type === 'captions'),
  ]
  for (const id of itemIds) {
    for (const o of dictValues(items)) {
      if (o.type === 'captions' && o.sourceItemId === id && !targets.includes(o.id))
        targets.push(o.id)
    }
  }
  // 分组维护:被分割 item 属某组时,两半都留在原组(src→rightId 记录,循环后一并并入)
  const splitPairs: [string, string][] = []
  for (const id of targets) {
    const item = items[id]
    if (!item)
      continue
    if (frame <= item.from || frame >= item.from + item.durationInFrames)
      continue
    const leftDur = frame - item.from
    const rightDur = item.durationInFrames - leftDur
    const rightId = `${id}-r${frame}`
    // 切口两侧清零对应淡变：左半清淡出、右半清淡入（视频同时清独立的音频淡变对）
    const left: EditorStarterItem = {
      ...item,
      durationInFrames: leftDur,
      fadeOutDurationInFrames: 0,
    }
    if (left.type === 'video')
      left.audioFadeOutDurationInFrames = 0
    const right: EditorStarterItem = {
      ...item,
      id: rightId,
      from: frame,
      durationInFrames: rightDur,
      fadeInDurationInFrames: 0,
    }
    if (right.type === 'video')
      right.audioFadeInDurationInFrames = 0
    if (isMediaItem(right) && isMediaItem(item)) {
      right.trimBefore = item.trimBefore + Math.round(leftDur * item.playbackRate)
    }
    if (right.type === 'captions' && item.type === 'captions') {
      // 字幕的 asset 装的是「这个块的内容」，不像视频素材那样可以两半共用 —— 共用的话右半会
      // 相对自己的起点从头重播左半的字幕。给右半一份独立的 asset，内容按切点平移。
      const srcAsset = assets[item.assetId]
      if (srcAsset?.type === 'caption') {
        const copy = createCaptionAsset({
          captions: shiftCaptions(srcAsset.captions, (leftDur / state.fps) * 1000),
          filename: srcAsset.filename,
        })
        assets[copy.id] = copy
        right.assetId = copy.id
      }
      // 源块也被切时（切视频连带切字幕），右半字幕改绑右半源；只切字幕则原绑定不动
      const srcRightId = (right.sourceItemId != null && right.sourceItemId !== '') ? `${right.sourceItemId}-r${frame}` : null
      if ((srcRightId != null && srcRightId !== '') && items[srcRightId])
        right.sourceItemId = srcRightId
    }
    items[id] = left
    items[rightId] = right
    splitPairs.push([id, rightId])
    changed = true
  }
  if (!changed)
    return state
  let groups = state.groups
  for (const [srcId, rightId] of splitPairs) groups = addItemToItemsGroup(groups, srcId, rightId)
  return { ...state, items, assets, groups }
}

/** 分割目标：有选中用选中，否则取播放头下的所有条目 */
export function resolveSplitTargets(state: UndoableState, frame: number, selectedIds: string[]): string[] {
  return selectedIds.length > 0
    ? selectedIds
    : dictValues(state.items)
        .filter(i => frame > i.from && frame < i.from + i.durationInFrames)
        .map(i => i.id)
}

export function snapFrame(state: UndoableState, frame: number, toleranceFrames: number, opts?: { playheadFrame?: number, ignoreIds?: string[] }): number {
  const candidates: number[] = [0]
  if (opts?.playheadFrame !== undefined)
    candidates.push(opts.playheadFrame)
  for (const item of dictValues(state.items)) {
    if (opts?.ignoreIds?.includes(item.id))
      continue
    candidates.push(item.from, item.from + item.durationInFrames)
  }
  let best = frame
  let bestDist = toleranceFrames + 1
  for (const c of candidates) {
    const d = Math.abs(c - frame)
    if (d < bestDist) {
      best = c
      bestDist = d
    }
  }
  return bestDist <= toleranceFrames ? best : frame
}

export function addTrack(state: UndoableState, index: number): { state: UndoableState, trackId: string } {
  const track = createTrack(`Track ${state.tracks.length + 1}`)
  const tracks = [...state.tracks]
  tracks.splice(index, 0, track)
  return { state: { ...state, tracks }, trackId: track.id }
}

/** 置顶/置底：把 item 移到新建的最外层轨道，再清理空轨道（与画布右键菜单一致） */
function reorderItemToEdge(state: UndoableState, itemId: string, where: 'front' | 'back'): UndoableState {
  const item = state.items[itemId]
  if (!item)
    return state
  const { state: st, trackId } = addTrack(state, where === 'front' ? 0 : state.tracks.length)
  const moved = moveItems(st, [{ id: itemId, trackId, from: item.from }])
  if (moved === st)
    return state
  return removeEmptyTracks(moved)
}

export function bringToFront(state: UndoableState, itemId: string): UndoableState {
  return reorderItemToEdge(state, itemId, 'front')
}

export function sendToBack(state: UndoableState, itemId: string): UndoableState {
  return reorderItemToEdge(state, itemId, 'back')
}

export function removeEmptyTracks(state: UndoableState): UndoableState {
  const used = new Set(dictValues(state.items).map(i => i.trackId))
  const kept = state.tracks.filter(t => used.has(t.id))
  if (kept.length === state.tracks.length)
    return state
  // 全空时保底留一条
  const tracks = kept.length > 0 ? kept : state.tracks.slice(0, 1)
  return { ...state, tracks }
}
