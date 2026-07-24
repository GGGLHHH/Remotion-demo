// 画布分组的纯逻辑(无 React / store)。单一真相源 = groups 表;item 不存 groupId,靠这里反查。
import type { Group } from './types';

/** item → 其所属组(扫描 groups;组数量少,O(n) 足够)。 */
export const findGroupOfItem = (groups: Record<string, Group>, itemId: string): Group | undefined =>
  Object.values(groups).find((g) => g.itemIds.includes(itemId));

/** 选中集展开:任一 id 属于某组 → 补全该组全部成员;去重、保序(先出现者在前)。 */
export const expandSelectionWithGroups = (ids: string[], groups: Record<string, Group>): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const id of ids) {
    const g = findGroupOfItem(groups, id);
    if (g) g.itemIds.forEach(add);
    else add(id);
  }
  return out;
};

/** 清理:摘除已不存在的成员;成员 <2 的组解散。无变化返回原引用(免无谓写)。 */
export const pruneGroups = (
  groups: Record<string, Group>,
  liveItemIds: Set<string>,
): Record<string, Group> => {
  let changed = false;
  const next: Record<string, Group> = {};
  for (const [id, g] of Object.entries(groups)) {
    const itemIds = g.itemIds.filter((i) => liveItemIds.has(i));
    if (itemIds.length < 2) {
      changed = true;
      continue;
    }
    if (itemIds.length !== g.itemIds.length) {
      changed = true;
      next[id] = { ...g, itemIds };
    } else {
      next[id] = g;
    }
  }
  return changed ? next : groups;
};

/** 从选中集建组(去重后 ≥2)。成员先从旧组摘出(不嵌套),旧组降到 <2 则解散。
 *  返回 { groups, groupId } 或 null(不足 2 个)。 */
export const groupFromSelection = (
  groups: Record<string, Group>,
  selectedIds: string[],
  newGroupId: string,
): { groups: Record<string, Group>; groupId: string } | null => {
  const members = [...new Set(selectedIds)];
  if (members.length < 2) return null;
  const memberSet = new Set(members);
  const next: Record<string, Group> = {};
  for (const [id, g] of Object.entries(groups)) {
    const kept = g.itemIds.filter((i) => !memberSet.has(i));
    if (kept.length >= 2) next[id] = kept.length === g.itemIds.length ? g : { ...g, itemIds: kept };
    // kept < 2 → 旧组解散(丢弃)
  }
  next[newGroupId] = { id: newGroupId, itemIds: members };
  return { groups: next, groupId: newGroupId };
};

/** 重排:把"成员集合恰好 === orderedItemIds 集合"的那个组的 itemIds 改成给定顺序。
 *  找不到匹配组、或顺序本就相同 → 返回原引用。用于序列(A)顺序持久化(组是唯一跨刷新的存处)。 */
export const reorderGroup = (
  groups: Record<string, Group>,
  orderedItemIds: string[],
): Record<string, Group> => {
  const set = new Set(orderedItemIds);
  const entry = Object.entries(groups).find(
    ([, g]) => g.itemIds.length === orderedItemIds.length && g.itemIds.every((id) => set.has(id)),
  );
  if (!entry) return groups;
  const [gid, g] = entry;
  if (g.itemIds.every((id, i) => id === orderedItemIds[i])) return groups; // 顺序未变
  return { ...groups, [gid]: { ...g, itemIds: [...orderedItemIds] } };
};

/** 拆分:删除选中集所涉及的所有组(成员回归自由)。无变化返回原引用。 */
export const ungroupBySelection = (
  groups: Record<string, Group>,
  selectedIds: string[],
): Record<string, Group> => {
  const sel = new Set(selectedIds);
  const affected = new Set<string>();
  for (const [id, g] of Object.entries(groups)) {
    if (g.itemIds.some((i) => sel.has(i))) affected.add(id);
  }
  if (affected.size === 0) return groups;
  const next: Record<string, Group> = {};
  for (const [id, g] of Object.entries(groups)) if (!affected.has(id)) next[id] = g;
  return next;
};

/** 把 newItemId 并入 srcItemId 所属组(split:两半同组)。srcItemId 无组或已含则原样返回。 */
export const addItemToItemsGroup = (
  groups: Record<string, Group>,
  srcItemId: string,
  newItemId: string,
): Record<string, Group> => {
  const g = findGroupOfItem(groups, srcItemId);
  if (!g || g.itemIds.includes(newItemId)) return groups;
  return { ...groups, [g.id]: { ...g, itemIds: [...g.itemIds, newItemId] } };
};

/** 副本重建组(duplicate/paste):把 idMap 里"原 id→新 id"按各自源组归拢,每个源组凑够 ≥2 个
 *  副本 → 建一个新组(源 id 不在任何当前组则跳过)。newGroupId(i) 给第 i 个新组一个 id。
 *  跨标签页粘贴时源 id 不在当前 groups → 自然零新组。 */
export const regroupDuplicated = (
  groups: Record<string, Group>,
  idMap: Record<string, string>,
  newGroupId: (index: number) => string,
): Record<string, Group> => {
  const byGroup = new Map<string, string[]>();
  for (const [origId, newItemId] of Object.entries(idMap)) {
    const src = findGroupOfItem(groups, origId);
    if (!src) continue;
    const arr = byGroup.get(src.id) ?? [];
    arr.push(newItemId);
    byGroup.set(src.id, arr);
  }
  let result = groups;
  let i = 0;
  for (const newItemIds of byGroup.values()) {
    if (newItemIds.length < 2) continue;
    const gid = newGroupId(i++);
    result = { ...result, [gid]: { id: gid, itemIds: newItemIds } };
  }
  return result;
};
