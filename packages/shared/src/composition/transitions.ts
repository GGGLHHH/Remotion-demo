import { interpolate } from 'remotion';
import type { EditorStarterItem, TransitionDirection, TransitionType, UndoableState } from '../types';

export type TransitionRenderProps = { opacity: number; translate?: string; scale?: string; clipPath?: string };

// 内部数值形态:便于多转场在同一 item 上合成(translate 相加、scale 相乘、opacity 相乘)。
// tx/ty = 平移百分比(相对片段自身盒),scale = 缩放因子(1=无)。
type VisualParts = { opacity: number; tx: number; ty: number; scale: number; clipPath?: string };

const visualParts = (
  type: TransitionType,
  direction: TransitionDirection | undefined,
  role: 'in' | 'out',
  p: number,
): VisualParts => {
  if (type === 'slide') {
    // exit 单位向量 = 旧内容离场方向;入场从反侧进入。名称方向 = 运动方向(与 wipe 对齐)。
    const exit = direction === 'left' ? [-1, 0] : direction === 'right' ? [1, 0] : direction === 'up' ? [0, -1] : [0, 1];
    const [ex, ey] = exit;
    if (role === 'out') return { opacity: 1, tx: ex * 100 * p, ty: ey * 100 * p, scale: 1 };
    return { opacity: 1, tx: -ex * 100 * (1 - p), ty: -ey * 100 * (1 - p), scale: 1 };
  }
  if (type === 'wipe') {
    if (role === 'out') return { opacity: 1, tx: 0, ty: 0, scale: 1 }; // 出场不裁,入场盖住(z 序入场在上)
    const r = 100 * (1 - p); // 遮挡边 100%→0
    // 名称方向 = 运动方向,新内容从反侧揭开(与 slide 一致:wipe-left = 新内容从右侧现身)。inset(top right bottom left)。
    const clipPath =
      direction === 'left' ? `inset(0 0 0 ${r}%)` :   // 从右揭开
      direction === 'right' ? `inset(0 ${r}% 0 0)` :  // 从左揭开
      direction === 'up' ? `inset(${r}% 0 0 0)` :     // 从下揭开
      `inset(0 0 ${r}% 0)`;                            // down:从上揭开
    return { opacity: 1, tx: 0, ty: 0, scale: 1, clipPath };
  }
  if (type === 'zoom') {
    if (direction === 'out') {
      return role === 'in'
        ? { opacity: p, tx: 0, ty: 0, scale: 1.2 - 0.2 * p }
        : { opacity: 1 - p, tx: 0, ty: 0, scale: 1 - 0.2 * p };
    }
    // zoom-in(默认)
    return role === 'in'
      ? { opacity: p, tx: 0, ty: 0, scale: 0.6 + 0.4 * p }
      : { opacity: 1 - p, tx: 0, ty: 0, scale: 1 + 0.2 * p };
  }
  // fade(默认):仅 opacity,与 v1 一致
  return { opacity: role === 'in' ? p : 1 - p, tx: 0, ty: 0, scale: 1 };
};

const format = ({ opacity, tx, ty, scale, clipPath }: VisualParts): TransitionRenderProps => ({
  opacity,
  translate: tx !== 0 || ty !== 0 ? `${tx}% ${ty}%` : undefined,
  scale: scale !== 1 ? `${scale}` : undefined,
  clipPath,
});

/**
 * 纯:单个转场对某片段(role='in' 入场/'out' 出场)在重叠窗口进度 p(0→1)时的渲染 props。
 * translate/scale 是 CSS 独立变换属性值(与 ItemPositioner 的 rotate 自动合成),clipPath 是 inset()。
 */
export const transitionVisual = (
  type: TransitionType,
  direction: TransitionDirection | undefined,
  role: 'in' | 'out',
  p: number,
): TransitionRenderProps => format(visualParts(type, direction, role, p));

/** item 在某帧因转场获得的渲染 props。absFrame = 合成绝对帧(调用方传 item.from + useCurrentFrame())。 */
export const getTransitionRenderProps = (
  state: UndoableState,
  item: EditorStarterItem,
  absFrame: number,
): TransitionRenderProps => {
  const transitions = state.transitions;
  if (!transitions) return { opacity: 1 };
  // 合成:一个 item 最多被 1 个转场引为入场、1 个引为出场(不变量)。短中间片段上两窗口可能重叠,
  // 故 opacity 相乘、translate 相加、scale 相乘(而非"后者覆盖",避免中间片段丢一半变换)。
  let opacity = 1;
  let tx = 0;
  let ty = 0;
  let scale = 1;
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
    const v = visualParts(t.type, t.direction, isTo ? 'in' : 'out', p);
    opacity *= v.opacity;
    tx += v.tx;
    ty += v.ty;
    scale *= v.scale;
    if (v.clipPath) clipPath = v.clipPath; // wipe 出场无 clipPath → 每 item 至多一个
  }
  return format({ opacity, tx, ty, scale, clipPath });
};
