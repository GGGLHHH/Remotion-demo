import type { Transition } from '@gedatou/shared'
import type { EditorStoreApi } from '#state/store'
import { dictValues, newId } from '@gedatou/shared'
import { TRANSITION_PRESETS } from '@gedatou/shared/composition'

const DEFAULT_TRANSITION_FRAMES = 12

function clampDur(dur: number, aDur: number, bDur: number): number {
  return Math.max(1, Math.min(Math.round(dur), aDur, bDur))
}

/** 建转场:B 左移 dur 形成重叠,插记录,单 undo,选中;返回 id */
export function addTransition(store: EditorStoreApi, fromItemId: string, toItemId: string): string {
  const id = newId()
  store.getState().updateUndoable((s) => {
    const a = s.items[fromItemId]
    const b = s.items[toItemId]
    if (!a || !b)
      return s
    const dur = clampDur(DEFAULT_TRANSITION_FRAMES, a.durationInFrames, b.durationInFrames)
    const t: Transition = { id, trackId: a.trackId, fromItemId, toItemId, type: 'fade', durationInFrames: dur }
    return {
      ...s,
      items: { ...s.items, [toItemId]: { ...b, from: a.from + a.durationInFrames - dur } },
      transitions: { ...s.transitions, [id]: t },
    }
  }, { commit: true })
  store.getState().setSelectedTransition(id)
  return id
}

/** 调时长:clamp,并据当前 A.end 重算 B.from(维持 overlap=dur) */
export function applyTransitionDuration(store: EditorStoreApi, id: string, dur: number, commit = true): void {
  store.getState().updateUndoable((s) => {
    const t = s.transitions[id]
    if (!t)
      return s
    const a = s.items[t.fromItemId]
    const b = s.items[t.toItemId]
    if (!a || !b)
      return s
    const clamped = clampDur(dur, a.durationInFrames, b.durationInFrames)
    if (clamped === t.durationInFrames && b.from === a.from + a.durationInFrames - clamped)
      return s // no-op 守卫
    return {
      ...s,
      items: { ...s.items, [t.toItemId]: { ...b, from: a.from + a.durationInFrames - clamped } },
      transitions: { ...s.transitions, [id]: { ...t, durationInFrames: clamped } },
    }
  }, { commit })
}

/** 换转场预设:写 type + direction(fade 无 direction 则删键),no-op 守卫,单 undo */
export function applyTransitionPreset(store: EditorStoreApi, id: string, presetId: string): void {
  const preset = TRANSITION_PRESETS.find(p => p.id === presetId)
  if (!preset)
    return
  store.getState().updateUndoable((s) => {
    const t = s.transitions[id]
    if (!t)
      return s
    if (t.type === preset.type && t.direction === preset.direction)
      return s // no-op 守卫
    const next: Transition = { ...t, type: preset.type }
    if (preset.direction)
      next.direction = preset.direction
    else delete next.direction
    return { ...s, transitions: { ...s.transitions, [id]: next } }
  }, { commit: true })
}

/**
 * 删转场:还原建立时对 B 的左移 —— B 贴回 A 当前尾部,重叠消除变硬切;被顶到的后续块最小级联右推。
 * 贴「A 当前尾部」而非 from += dur:中途可能改过转场时长或 trim 过 A,直接表达"消除重叠"更稳。
 * A/B 已被删(孤儿)则只删记录。删记录与移位在同一次 updateUndoable ⇒ 单步撤销。
 */
export function removeTransition(store: EditorStoreApi, id: string): void {
  store.getState().updateUndoable((s) => {
    const t = s.transitions[id]
    if (!t)
      return s
    const rest = { ...s.transitions }
    delete rest[id]
    const a = s.items[t.fromItemId]
    const b = s.items[t.toItemId]
    if (!a || !b)
      return { ...s, transitions: rest }
    const bFrom = a.from + a.durationInFrames
    if (bFrom === b.from)
      return { ...s, transitions: rest } // 本就没重叠(如被手动拖开)
    const items = { ...s.items, [b.id]: { ...b, from: bFrom } }
    // 同轨道排在 B 之后的块:会被顶到才推,空隙够就整条链都不动(已按起帧排序 ⇒ 可提前收工)
    const after = dictValues(s.items)
      .filter(o => o.trackId === b.trackId && o.id !== b.id && o.from >= b.from)
      .sort((x, y) => x.from - y.from)
    let next = bFrom + b.durationInFrames
    for (const o of after) {
      if (o.from >= next)
        break
      items[o.id] = { ...o, from: next }
      next += o.durationInFrames
    }
    return { ...s, items, transitions: rest }
  }, { commit: true })
  if (store.getState().selectedTransitionId === id)
    store.getState().setSelectedTransition(null)
}
