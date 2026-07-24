import { getOrderedItems, type EditorStarterItem, type UndoableState } from '@gedatou/shared';

export type Rect = { left: number; top: number; width: number; height: number };

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const MIN_SIZE = 20;

/** 点是否命中矩形（rotation 为角度制，绕矩形中心） */
export const hitTest = (rect: Rect, rotationDeg: number, px: number, py: number): boolean => {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  // 把点反向旋转回矩形本地坐标
  const rad = (-rotationDeg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad) + cx;
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad) + cy;
  return (
    lx >= rect.left && lx <= rect.left + rect.width && ly >= rect.top && ly <= rect.top + rect.height
  );
};

const visibleAtFrame = (item: EditorStarterItem, frame: number): boolean =>
  frame >= item.from && frame < item.from + item.durationInFrames;

/** 当前帧可见且命中的最上层 item（渲染顺序逆序找） */
export const topmostItemAt = (
  state: UndoableState,
  frame: number,
  px: number,
  py: number,
): EditorStarterItem | null => {
  const ordered = getOrderedItems(state); // 底层在前
  for (let i = ordered.length - 1; i >= 0; i--) {
    const item = ordered[i];
    if (item.type === 'audio') continue; // 音频无画面，不参与画布命中
    if (!visibleAtFrame(item, frame)) continue;
    if (hitTest(item, item.rotation, px, py)) return item;
  }
  return null;
};

/** 8 向手柄缩放。corner + keepAspect 保持宽高比；最小尺寸 20 */
export const resizeRect = (
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepAspect: boolean,
): Rect => {
  let { left, top, width, height } = start;
  const right = start.left + start.width;
  const bottom = start.top + start.height;

  if (handle.includes('e')) width = Math.max(MIN_SIZE, start.width + dx);
  if (handle.includes('s')) height = Math.max(MIN_SIZE, start.height + dy);
  if (handle.includes('w')) {
    width = Math.max(MIN_SIZE, start.width - dx);
    left = right - width;
  }
  if (handle.includes('n')) {
    height = Math.max(MIN_SIZE, start.height - dy);
    top = bottom - height;
  }

  const isCorner = handle.length === 2;
  if (isCorner && keepAspect) {
    const aspect = start.width / start.height;
    // 以变化量更大的轴为准
    if (Math.abs(width - start.width) >= Math.abs(height - start.height) * aspect) {
      height = Math.max(MIN_SIZE, width / aspect);
    } else {
      width = Math.max(MIN_SIZE, height * aspect);
    }
    if (handle.includes('w')) left = right - width;
    if (handle.includes('n')) top = bottom - height;
  }

  return { left, top, width, height };
};

// 画布坐标换算(各 overlay 原各手写一遍 (client - rect)/scale)。取哪个元素做 rect 由调用方决定
// (SelectionOverlay 取 closest('[data-stage]')、其余取 currentTarget),故 el 作入参,只共享除以 scale 的算术。
export const toStagePoint = (el: Element, clientX: number, clientY: number, scale: number): { x: number; y: number } => {
  const rect = el.getBoundingClientRect();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
};

/** 拖拽增量(合成坐标):(client - start)/scale */
export const toDelta = (startX: number, startY: number, clientX: number, clientY: number, scale: number): { dx: number; dy: number } => ({
  dx: (clientX - startX) / scale,
  dy: (clientY - startY) / scale,
});
