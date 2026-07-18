import type { EditorStarterItem, UndoableState } from '../types';

/**
 * 返回渲染顺序的 items：tracks[0] 是最上层轨道，因此要最后绘制。
 * 隐藏轨道不参与渲染。
 */
export const getOrderedItems = (state: UndoableState): EditorStarterItem[] => {
  const result: EditorStarterItem[] = [];
  for (let i = state.tracks.length - 1; i >= 0; i--) {
    const track = state.tracks[i];
    if (track.hidden) continue;
    for (const item of Object.values(state.items)) {
      if (item.trackId === track.id) result.push(item);
    }
  }
  return result;
};
