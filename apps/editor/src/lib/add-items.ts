import { createSolidItem, createTextItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { playerRef } from '../canvas/player-ref';
import { addTrack } from '../timeline/ops';

/** 用 2D canvas 量测单行文本宽度（拿不到 context 时按字号粗估） */
const measureTextWidth = (
  text: string,
  font: { fontStyle: string; fontWeight: string; fontSize: number; fontFamily: string },
): number => {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * font.fontSize;
  ctx.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`;
  return ctx.measureText(text).width;
};

/** 文本工具：在点击点放置自适应尺寸的文本（内容「文本」、字号 80），选中但不进入行内编辑 */
export const addTextItem = (at: { x: number; y: number }): void => {
  const store = useEditorStore.getState();
  const from = playerRef.current?.getCurrentFrame() ?? 0;
  let id = '';
  store.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0);
    const item = createTextItem({ trackId, from, text: '文本' });
    // 盒子自适应文字内容
    item.width = Math.max(
      20,
      Math.ceil(measureTextWidth(item.text, item) + item.letterSpacing * item.text.length),
    );
    item.height = Math.ceil(item.fontSize * item.lineHeight);
    item.left = Math.round(at.x - item.width / 2);
    item.top = Math.round(at.y - item.height / 2);
    id = item.id;
    return { ...st, items: { ...st.items, [item.id]: item } };
  });
  store.setSelected([id]);
};

/** 画布绘制工具：按给定矩形加色块（官方默认白色） */
export const addSolidItem = (rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): void => {
  const store = useEditorStore.getState();
  const from = playerRef.current?.getCurrentFrame() ?? 0;
  let id = '';
  store.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const item = createSolidItem({ trackId, from, width, height });
    item.color = '#ffffff';
    item.left = Math.round(rect.left);
    item.top = Math.round(rect.top);
    id = item.id;
    return { ...st, items: { ...st.items, [item.id]: item } };
  });
  store.setSelected([id]);
};
