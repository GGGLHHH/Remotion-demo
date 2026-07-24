import type { EditorStarterItem } from '@gedatou/shared';
import { useEditor } from '../state/context';

export type PatchFn = (partial: Partial<EditorStarterItem>, commit?: boolean) => void;

/** 条目补丁函数(各类型面板 + 宿主拼装 InspectorSections 共用):
 *  partial 合入 item 顶层字段;commit=false 走高频路径,松手用 store.commitPending 提交。 */
export const useItemPatch = (itemId: string): PatchFn => {
  const updateUndoable = useEditor((s) => s.updateUndoable);
  return (partial, commit = true) => {
    updateUndoable(
      (s) => {
        const cur = s.items[itemId];
        if (!cur) return s;
        return { ...s, items: { ...s.items, [itemId]: { ...cur, ...partial } as EditorStarterItem } };
      },
      { commit },
    );
  };
};
