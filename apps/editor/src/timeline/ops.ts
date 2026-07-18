import { createTrack, type EditorStarterItem, type UndoableState } from '@editor/shared';

/** 媒体类 item（有 trimBefore/playbackRate） */
const isMediaItem = (
  item: EditorStarterItem,
): item is Extract<EditorStarterItem, { trimBefore: number }> =>
  item.type === 'video' || item.type === 'audio' || item.type === 'gif';

/** 素材总长（帧，素材原速） */
const assetDurationInFrames = (state: UndoableState, item: EditorStarterItem): number | null => {
  if (!isMediaItem(item)) return null;
  const asset = state.assets[item.assetId];
  if (!asset || !('durationInSeconds' in asset)) return null;
  return Math.floor(asset.durationInSeconds * state.fps);
};

/** 媒体项在时间轴上的最大可用时长（按 playbackRate 换算）；非媒体项 null */
export const maxItemDurationInFrames = (state: UndoableState, id: string): number | null => {
  const item = state.items[id];
  if (!item) return null;
  if (item.type === 'gif') return null; // gif 循环播放，不受素材时长限制
  const total = assetDurationInFrames(state, item);
  if (total === null || !isMediaItem(item)) return null;
  return Math.floor((total - item.trimBefore) / item.playbackRate);
};

/** 修剪拖拽时的最大可扩展指示：有限媒体（video/audio）左右各还能扩展多少帧 */
export const maxExtendFrames = (
  state: UndoableState,
  id: string,
): { left: number; right: number } | null => {
  const item = state.items[id];
  if (!item || (item.type !== 'video' && item.type !== 'audio')) return null;
  const maxDur = maxItemDurationInFrames(state, id);
  if (maxDur === null) return null;
  return {
    // 左侧：素材已修剪掉的部分（换算到时间轴帧），且不能早于 0 帧
    left: Math.min(Math.floor(item.trimBefore / item.playbackRate), item.from),
    right: Math.max(0, maxDur - item.durationInFrames),
  };
};

export const hasOverlap = (
  state: UndoableState,
  trackId: string,
  from: number,
  durationInFrames: number,
  ignoreIds: string[],
): boolean => {
  const end = from + durationInFrames;
  for (const item of Object.values(state.items)) {
    if (item.trackId !== trackId || ignoreIds.includes(item.id)) continue;
    if (from < item.from + item.durationInFrames && item.from < end) return true;
  }
  return false;
};

export const moveItems = (
  state: UndoableState,
  moves: { id: string; trackId: string; from: number }[],
): UndoableState => {
  if (moves.length === 0) return state;
  const movedIds = moves.map((m) => m.id);
  // 校验：负 from、轨道存在、与未移动项冲突、移动项之间冲突
  for (const move of moves) {
    const item = state.items[move.id];
    if (!item) return state;
    if (move.from < 0) return state;
    if (!state.tracks.some((t) => t.id === move.trackId)) return state;
    if (hasOverlap(state, move.trackId, move.from, item.durationInFrames, movedIds)) return state;
  }
  for (let i = 0; i < moves.length; i++) {
    for (let j = i + 1; j < moves.length; j++) {
      const a = moves[i];
      const b = moves[j];
      if (a.trackId !== b.trackId) continue;
      const aDur = state.items[a.id].durationInFrames;
      const bDur = state.items[b.id].durationInFrames;
      if (a.from < b.from + bDur && b.from < a.from + aDur) return state;
    }
  }
  const items = { ...state.items };
  for (const move of moves) {
    items[move.id] = { ...items[move.id], trackId: move.trackId, from: move.from };
  }
  return { ...state, items };
};

export const trimItem = (
  state: UndoableState,
  id: string,
  edge: 'start' | 'end',
  deltaFrames: number,
): UndoableState => {
  const item = state.items[id];
  if (!item || deltaFrames === 0) return state;

  if (edge === 'start') {
    let delta = deltaFrames;
    // 不能把时长修剪到 < 1
    delta = Math.min(delta, item.durationInFrames - 1);
    // 不能早于 0 帧
    delta = Math.max(delta, -item.from);
    // 媒体项：不能露出素材开头之前
    if (isMediaItem(item)) {
      delta = Math.max(delta, -Math.floor(item.trimBefore / item.playbackRate));
    }
    // 不与左邻居重叠
    let leftBound = 0;
    for (const other of Object.values(state.items)) {
      if (other.trackId !== item.trackId || other.id === id) continue;
      const otherEnd = other.from + other.durationInFrames;
      if (otherEnd <= item.from) leftBound = Math.max(leftBound, otherEnd);
    }
    delta = Math.max(delta, leftBound - item.from);
    if (delta === 0) return state;
    const next: EditorStarterItem = {
      ...item,
      from: item.from + delta,
      durationInFrames: item.durationInFrames - delta,
    };
    if (isMediaItem(next) && isMediaItem(item)) {
      next.trimBefore = Math.max(0, item.trimBefore + Math.round(delta * item.playbackRate));
    }
    return { ...state, items: { ...state.items, [id]: next } };
  }

  // end
  let delta = deltaFrames;
  delta = Math.max(delta, 1 - item.durationInFrames); // 最小 1
  const maxDur = maxItemDurationInFrames(state, id);
  if (maxDur !== null) {
    delta = Math.min(delta, maxDur - item.durationInFrames);
  }
  // 不与右邻居重叠
  let rightBound = Infinity;
  for (const other of Object.values(state.items)) {
    if (other.trackId !== item.trackId || other.id === id) continue;
    if (other.from >= item.from + item.durationInFrames) {
      rightBound = Math.min(rightBound, other.from);
    }
  }
  delta = Math.min(delta, rightBound - item.from - item.durationInFrames);
  if (delta === 0) return state;
  return {
    ...state,
    items: {
      ...state.items,
      [id]: { ...item, durationInFrames: item.durationInFrames + delta },
    },
  };
};

export const splitItemsAtFrame = (
  state: UndoableState,
  frame: number,
  itemIds: string[],
): UndoableState => {
  let changed = false;
  const items = { ...state.items };
  for (const id of itemIds) {
    const item = items[id];
    if (!item) continue;
    if (frame <= item.from || frame >= item.from + item.durationInFrames) continue;
    const leftDur = frame - item.from;
    const rightDur = item.durationInFrames - leftDur;
    const rightId = `${id}-r${frame}`;
    const left: EditorStarterItem = {
      ...item,
      durationInFrames: leftDur,
      fadeOutDurationInFrames: 0,
    };
    const right: EditorStarterItem = {
      ...item,
      id: rightId,
      from: frame,
      durationInFrames: rightDur,
      fadeInDurationInFrames: 0,
    };
    if (isMediaItem(right) && isMediaItem(item)) {
      right.trimBefore = item.trimBefore + Math.round(leftDur * item.playbackRate);
    }
    items[id] = left;
    items[rightId] = right;
    changed = true;
  }
  return changed ? { ...state, items } : state;
};

/** 分割目标：有选中用选中，否则取播放头下的所有条目 */
export const resolveSplitTargets = (
  state: UndoableState,
  frame: number,
  selectedIds: string[],
): string[] =>
  selectedIds.length > 0
    ? selectedIds
    : Object.values(state.items)
        .filter((i) => frame > i.from && frame < i.from + i.durationInFrames)
        .map((i) => i.id);

export const snapFrame = (
  state: UndoableState,
  frame: number,
  toleranceFrames: number,
  opts?: { playheadFrame?: number; ignoreIds?: string[] },
): number => {
  const candidates: number[] = [0];
  if (opts?.playheadFrame !== undefined) candidates.push(opts.playheadFrame);
  for (const item of Object.values(state.items)) {
    if (opts?.ignoreIds?.includes(item.id)) continue;
    candidates.push(item.from, item.from + item.durationInFrames);
  }
  let best = frame;
  let bestDist = toleranceFrames + 1;
  for (const c of candidates) {
    const d = Math.abs(c - frame);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return bestDist <= toleranceFrames ? best : frame;
};

export const addTrack = (
  state: UndoableState,
  index: number,
): { state: UndoableState; trackId: string } => {
  const track = createTrack(`Track ${state.tracks.length + 1}`);
  const tracks = [...state.tracks];
  tracks.splice(index, 0, track);
  return { state: { ...state, tracks }, trackId: track.id };
};

export const removeEmptyTracks = (state: UndoableState): UndoableState => {
  const used = new Set(Object.values(state.items).map((i) => i.trackId));
  const kept = state.tracks.filter((t) => used.has(t.id));
  if (kept.length === state.tracks.length) return state;
  // 全空时保底留一条
  const tracks = kept.length > 0 ? kept : state.tracks.slice(0, 1);
  return { ...state, tracks };
};
