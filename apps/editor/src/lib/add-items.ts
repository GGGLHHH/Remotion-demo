import { createSolidItem, createTextItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { playerRef } from '../canvas/player-ref';
import { addTrack } from '../timeline/ops';

/** 顶栏工具：加文本（画布中心、当前帧） */
export const addTextItem = (): void => {
  const store = useEditorStore.getState();
  const from = playerRef.current?.getCurrentFrame() ?? 0;
  let id = '';
  store.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0);
    const item = createTextItem({ trackId, from });
    item.left = Math.round((st.compositionWidth - item.width) / 2);
    item.top = Math.round((st.compositionHeight - item.height) / 2);
    id = item.id;
    return { ...st, items: { ...st.items, [item.id]: item } };
  });
  store.setSelected([id]);
  store.setTextItemEditing(id);
};

/** 顶栏工具：画色块（居中 1/3 大小；ponytail: 官方是拖拽画框，先按钮直出，需要再升级） */
export const addSolidItem = (): void => {
  const store = useEditorStore.getState();
  const from = playerRef.current?.getCurrentFrame() ?? 0;
  let id = '';
  store.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0);
    const width = Math.round(st.compositionWidth / 3);
    const height = Math.round(st.compositionHeight / 3);
    const item = createSolidItem({ trackId, from, width, height });
    item.left = Math.round((st.compositionWidth - width) / 2);
    item.top = Math.round((st.compositionHeight - height) / 2);
    id = item.id;
    return { ...st, items: { ...st.items, [item.id]: item } };
  });
  store.setSelected([id]);
};
