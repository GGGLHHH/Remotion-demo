import { createTextItem, newId, type EditorStarterItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { addTrack } from '../timeline/ops';

export const copySelection = (): void => {
  const store = useEditorStore.getState();
  const items = store.selectedItemIds
    .map((id) => store.undoable.items[id])
    .filter((i): i is EditorStarterItem => Boolean(i));
  if (items.length) store.setClipboard(items);
};

/** 粘贴：每项落入新建顶部轨道（避免任何重叠冲突），位置偏移 20px */
const placeItems = (items: EditorStarterItem[]): void => {
  const store = useEditorStore.getState();
  const newIds: string[] = [];
  store.updateUndoable((s) => {
    let st = s;
    const newItems = { ...s.items };
    for (const item of items) {
      const added = addTrack(st, 0);
      st = added.state;
      const id = newId();
      newIds.push(id);
      newItems[id] = {
        ...item,
        id,
        trackId: added.trackId,
        left: item.left + 20,
        top: item.top + 20,
      };
    }
    return { ...st, items: newItems };
  });
  store.setSelected(newIds);
};

export const pasteClipboard = (): void => {
  const { clipboard } = useEditorStore.getState();
  if (clipboard.length) placeItems(clipboard);
};

export const duplicateSelection = (): void => {
  const store = useEditorStore.getState();
  const items = store.selectedItemIds
    .map((id) => store.undoable.items[id])
    .filter((i): i is EditorStarterItem => Boolean(i));
  if (items.length) placeItems(items);
};

/** 系统剪贴板文本 → 文本项（放画布中心、当前帧） */
export const pasteTextAsTextItem = (text: string, currentFrame: number): void => {
  const store = useEditorStore.getState();
  store.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0);
    const item = createTextItem({ trackId, from: currentFrame, text });
    item.left = Math.round((st.compositionWidth - item.width) / 2);
    item.top = Math.round((st.compositionHeight - item.height) / 2);
    return { ...st, items: { ...st.items, [item.id]: item } };
  });
};
