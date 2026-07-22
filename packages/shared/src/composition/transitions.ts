import { interpolate } from 'remotion';
import type { EditorStarterItem, UndoableState } from '../types';

/** item 在某帧因转场获得的乘子。absFrame = 合成绝对帧(调用方传 item.from + useCurrentFrame())。 */
export const getTransitionRenderProps = (
  state: UndoableState,
  item: EditorStarterItem,
  absFrame: number,
): { opacity: number } => {
  const transitions = state.transitions;
  if (!transitions) return { opacity: 1 };
  let opacity = 1;
  for (const t of Object.values(transitions)) {
    const isFrom = t.fromItemId === item.id;
    const isTo = t.toItemId === item.id;
    if (!isFrom && !isTo) continue;
    const from = state.items[t.fromItemId];
    const to = state.items[t.toItemId];
    if (!from || !to) continue; // 孤儿安全
    const liveOverlap = from.from + from.durationInFrames - to.from;
    const d = Math.min(t.durationInFrames, liveOverlap);
    if (d <= 0) continue;
    const start = to.from; // 绝对帧
    const end = to.from + d;
    if (isTo) opacity *= interpolate(absFrame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    if (isFrom) opacity *= interpolate(absFrame, [start, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  }
  return { opacity };
};
