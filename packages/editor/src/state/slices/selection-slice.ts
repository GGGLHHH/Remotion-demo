import {
  expandSelectionWithGroups,
  groupFromSelection,
  newId,
  pruneGroups,
  reorderGroup,
  ungroupBySelection,
} from '@gedatou/shared';
import type { EditorGet, EditorSet, EditorStore } from '../store';

// 选择 slice:选中项/转场 + 成组/拆组/重排 + 删除。写 undoable 一律经 get().updateUndoable(history slice)。
export const createSelectionSlice = (
  set: EditorSet,
  get: EditorGet,
): Pick<
  EditorStore,
  | 'selectedItemIds'
  | 'selectedTransitionId'
  | 'setSelected'
  | 'deleteSelected'
  | 'groupSelected'
  | 'ungroupSelected'
  | 'reorderGroupItems'
  | 'setSelectedTransition'
> => ({
  selectedItemIds: [],
  selectedTransitionId: null,

  // 单点收口:命中任一组成员 → 展开选整组(所有选择入口自动整组选中)
  setSelected: (ids) =>
    set({ selectedItemIds: expandSelectionWithGroups(ids, get().undoable.groups), selectedTransitionId: null }),

  groupSelected: () => {
    const { selectedItemIds, updateUndoable } = get();
    updateUndoable((s) => {
      const res = groupFromSelection(s.groups, selectedItemIds, newId());
      return res ? { ...s, groups: res.groups } : s;
    });
  },
  ungroupSelected: () => {
    const { selectedItemIds, updateUndoable } = get();
    updateUndoable((s) => {
      const groups = ungroupBySelection(s.groups, selectedItemIds);
      return groups === s.groups ? s : { ...s, groups };
    });
  },
  reorderGroupItems: (orderedItemIds) =>
    get().updateUndoable((s) => {
      const groups = reorderGroup(s.groups, orderedItemIds);
      return groups === s.groups ? s : { ...s, groups };
    }),

  setSelectedTransition: (id) => set({ selectedTransitionId: id, selectedItemIds: [] }),

  deleteSelected: () => {
    const { selectedItemIds, updateUndoable } = get();
    if (selectedItemIds.length === 0) return;
    updateUndoable((s) => {
      const items = { ...s.items };
      for (const id of selectedItemIds) delete items[id];
      // 绑定被删块的字幕一并删掉:留着就是一段没有音画可对的孤儿字幕。
      // 与删除同在一次 updateUndoable ⇒ 一步撤销即可同时恢复。字幕自己被选中删时不触发(它没有 sourceItemId 指向自己)。
      const gone = new Set(selectedItemIds);
      for (const o of Object.values(items)) {
        if (o.type === 'captions' && o.sourceItemId && gone.has(o.sourceItemId)) delete items[o.id];
      }
      // 不再被引用的素材进入两阶段删除(清理时才真正删远端/缓存)
      const referenced = new Set(
        Object.values(items)
          .map((i) => ('assetId' in i ? i.assetId : null))
          .filter(Boolean),
      );
      const already = new Set(s.deletedAssets.map((d) => d.assetId));
      const deletedAssets = [...s.deletedAssets];
      for (const assetId of Object.keys(s.assets)) {
        if (!referenced.has(assetId) && !already.has(assetId)) {
          deletedAssets.push({ assetId, deletedAt: Date.now() });
        }
      }
      // 孤儿清理:引用了被删 item 的转场一并删除(渲染端不容忍 dangling id)
      const transitions = Object.fromEntries(
        Object.entries(s.transitions ?? {}).filter(
          ([, t]) => !selectedItemIds.includes(t.fromItemId) && !selectedItemIds.includes(t.toItemId),
        ),
      );
      // 组孤儿清理:摘除被删成员,成员降到 <2 的组解散
      const groups = pruneGroups(s.groups, new Set(Object.keys(items)));
      return { ...s, items, deletedAssets, transitions, groups };
    });
    set({ selectedItemIds: [] });
  },
});
