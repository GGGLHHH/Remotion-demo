import type { EditorStarterItem, UndoableState } from '../types'
import { dictValues } from '../dict'

/**
 * 返回渲染顺序的 items：tracks[0] 是最上层轨道，因此要最后绘制。
 * 隐藏轨道不参与渲染。
 */
export function getOrderedItems(state: UndoableState): EditorStarterItem[] {
  const result: EditorStarterItem[] = []
  for (let i = state.tracks.length - 1; i >= 0; i--) {
    const track = state.tracks[i]
    if (track.hidden)
      continue
    const trackItems = dictValues(state.items)
      .filter((it): it is EditorStarterItem => it?.trackId === track.id)
    trackItems.sort((x, y) => x.from - y.from)
    for (const item of trackItems) result.push(item)
  }
  return result
}
