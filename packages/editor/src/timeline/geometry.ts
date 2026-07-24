import type { UndoableState } from '@gedatou/shared';
import { AUDIO_TRACK_HEIGHT, MEDIA_TRACK_HEIGHT, RULER_HEIGHT, TRACK_HEIGHT } from './constants';

// 变高行几何(官方:含视频/音频的轨道行更高):所有 y↔行 换算统一走前缀和。
// 从 TimelinePanel 搬出:纯函数(state,...)→number,被移动拖拽/框选命中/渲染/OS 拖放多处复用,可脱 React 单测。

/** 单条轨道行高(官方):含视频 ⇒ 70,纯音频 ⇒ 48,其余 ⇒ 34 */
export const rowHeightOf = (st: UndoableState, trackId: string): number => {
  let hasAudio = false;
  for (const i of Object.values(st.items)) {
    if (i.trackId !== trackId) continue;
    if (i.type === 'video') return MEDIA_TRACK_HEIGHT;
    if (i.type === 'audio') hasAudio = true;
  }
  return hasAudio ? AUDIO_TRACK_HEIGHT : TRACK_HEIGHT;
};

/** 前缀和(内容坐标,含标尺):tops[i] = 第 i 行顶部 y,tops[n] = 所有行底部 */
export const rowTops = (st: UndoableState): number[] => {
  const tops = [RULER_HEIGHT];
  for (const t of st.tracks) tops.push(tops[tops.length - 1] + rowHeightOf(st, t.id));
  return tops;
};

/** y(内容坐标)→ 行号;标尺内 = -1,底行之下 = 轨道数 n */
export const trackIndexAtY = (st: UndoableState, y: number): number => {
  if (y < RULER_HEIGHT) return -1;
  const tops = rowTops(st);
  for (let i = 0; i < st.tracks.length; i++) if (y < tops[i + 1]) return i;
  return st.tracks.length;
};
