import type { AnimatableProp, EditorStarterItem, Keyframe, KeyframeEasing } from '@gedatou/shared';
import {
  buildPreset,
  keyframeAt,
  moveKeyframeInList,
  removeKeyframeAt,
  resolveProp,
  upsertKeyframe,
  withKeyframeList,
  type PresetId,
} from '@gedatou/shared/composition';
import type { EditorStoreApi } from '../state/store';

const clampFrame = (item: EditorStarterItem, f: number): number =>
  Math.max(0, Math.min(item.durationInFrames, Math.round(f)));

type ListFn = (list: Keyframe[], item: EditorStarterItem) => Keyframe[];

const patchKf = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, fn: ListFn, commit = true): void => {
  store.getState().updateUndoable((s) => {
    const it = s.items[itemId];
    if (!it) return s;
    const prev = it.keyframes?.[prop] ?? [];
    const nextList = fn(prev, it);
    if (nextList === prev) return s; // 无变化;交给 updateUndoable 的 next===undoable 兜底,不占 undo 槽
    const next = withKeyframeList(it, prop, nextList);
    return { ...s, items: { ...s.items, [itemId]: next } };
  }, { commit });
};

export const toggleKeyframe = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, frame: number): void =>
  patchKf(store, itemId, prop, (list, it) => {
    const f = clampFrame(it, frame);
    if (keyframeAt(list, f)) return removeKeyframeAt(list, f);
    return upsertKeyframe(list, { frame: f, value: resolveProp(it, prop, f), easing: 'easeInOut' });
  });

export const setKeyframeValue = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, frame: number, value: number, commit = true): void =>
  patchKf(store, itemId, prop, (list, it) => {
    const f = clampFrame(it, frame);
    return upsertKeyframe(list, { frame: f, value, easing: keyframeAt(list, f)?.easing ?? 'easeInOut' });
  }, commit);

export const setKeyframeEasing = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, frame: number, easing: KeyframeEasing): void =>
  patchKf(store, itemId, prop, (list, it) => {
    const k = keyframeAt(list, clampFrame(it, frame));
    return k ? upsertKeyframe(list, { ...k, easing }) : list;
  });

export const moveKeyframe = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, from: number, to: number, commit = true): void =>
  patchKf(store, itemId, prop, (list, it) => moveKeyframeInList(list, from, clampFrame(it, to)), commit);

export const clearKeyframes = (store: EditorStoreApi, itemId: string, prop: AnimatableProp): void =>
  patchKf(store, itemId, prop, (list) => (list.length ? [] : list));

/** 把某帧上所有属性的关键帧一起挪(时间线合并轨拖拽) */
export const moveKeyframesAtFrame = (store: EditorStoreApi, itemId: string, from: number, to: number, commit = true): void => {
  store.getState().updateUndoable((s) => {
    const it = s.items[itemId];
    if (!it?.keyframes) return s;
    const f = clampFrame(it, to);
    let next = it;
    for (const prop of Object.keys(it.keyframes) as AnimatableProp[]) {
      const list = it.keyframes[prop];
      if (list && keyframeAt(list, from)) next = withKeyframeList(next, prop, moveKeyframeInList(list, from, f));
    }
    if (next === it) return s; // 该帧上没有任何属性的关键帧;不占 undo 槽
    return { ...s, items: { ...s.items, [itemId]: next } };
  }, { commit });
};

export const applyAnimationPreset = (store: EditorStoreApi, itemId: string, presetId: PresetId): void => {
  store.getState().updateUndoable((s) => {
    const it = s.items[itemId];
    if (!it) return s;
    const preset = buildPreset(presetId, it);
    let next = it;
    for (const prop of Object.keys(preset) as AnimatableProp[]) next = withKeyframeList(next, prop, preset[prop]!);
    return { ...s, items: { ...s.items, [itemId]: next } };
  }, { commit: true });
};
