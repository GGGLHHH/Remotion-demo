import { interpolate } from 'remotion';
import type { EditorStarterItem, TransitionDirection, TransitionType, UndoableState } from '../types';

export type TransitionRenderProps = { opacity: number; translate?: string; scale?: string; clipPath?: string };

/**
 * 纯:单个转场对某片段(role='in' 入场/'out' 出场)在重叠窗口进度 p(0→1)时的渲染 props。
 * translate/scale 是 CSS 独立变换属性值(与 ItemPositioner 的 rotate 自动合成),clipPath 是 inset()。
 */
export const transitionVisual = (
  type: TransitionType,
  direction: TransitionDirection | undefined,
  role: 'in' | 'out',
  p: number,
): TransitionRenderProps => {
  if (type === 'slide') {
    // exit 单位向量 = 旧内容离场方向;入场从反侧进入。translate % 相对片段自身盒。
    const exit = direction === 'left' ? [-1, 0] : direction === 'right' ? [1, 0] : direction === 'up' ? [0, -1] : [0, 1];
    const [ex, ey] = exit;
    if (role === 'out') return { opacity: 1, translate: `${ex * 100 * p}% ${ey * 100 * p}%` };
    return { opacity: 1, translate: `${-ex * 100 * (1 - p)}% ${-ey * 100 * (1 - p)}%` };
  }
  if (type === 'wipe') {
    if (role === 'out') return { opacity: 1 }; // 出场不裁,入场盖住(z 序入场在上)
    const r = 100 * (1 - p); // 遮挡边 100%→0
    const clipPath =
      direction === 'left' ? `inset(0 ${r}% 0 0)` :
      direction === 'right' ? `inset(0 0 0 ${r}%)` :
      direction === 'up' ? `inset(0 0 ${r}% 0)` :
      `inset(${r}% 0 0 0)`; // down
    return { opacity: 1, clipPath };
  }
  if (type === 'zoom') {
    if (direction === 'out') {
      return role === 'in'
        ? { opacity: p, scale: `${1.2 - 0.2 * p}` }
        : { opacity: 1 - p, scale: `${1 - 0.2 * p}` };
    }
    // zoom-in(默认)
    return role === 'in'
      ? { opacity: p, scale: `${0.6 + 0.4 * p}` }
      : { opacity: 1 - p, scale: `${1 + 0.2 * p}` };
  }
  // fade(默认):仅 opacity,与 v1 一致
  return { opacity: role === 'in' ? p : 1 - p };
};

/** item 在某帧因转场获得的渲染 props。absFrame = 合成绝对帧(调用方传 item.from + useCurrentFrame())。 */
export const getTransitionRenderProps = (
  state: UndoableState,
  item: EditorStarterItem,
  absFrame: number,
): TransitionRenderProps => {
  const transitions = state.transitions;
  if (!transitions) return { opacity: 1 };
  let opacity = 1;
  let translate: string | undefined;
  let scale: string | undefined;
  let clipPath: string | undefined;
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
    const p = interpolate(absFrame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const rp = transitionVisual(t.type, t.direction, isTo ? 'in' : 'out', p);
    opacity *= rp.opacity;
    if (rp.translate) translate = rp.translate;
    if (rp.scale) scale = rp.scale;
    if (rp.clipPath) clipPath = rp.clipPath;
  }
  return { opacity, translate, scale, clipPath };
};
