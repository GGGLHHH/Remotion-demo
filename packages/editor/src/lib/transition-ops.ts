import { newId, type Transition } from '@gedatou/shared';
import { TRANSITION_PRESETS } from '@gedatou/shared/composition';
import type { EditorStoreApi } from '../state/store';

const DEFAULT_TRANSITION_FRAMES = 12;

const clampDur = (dur: number, aDur: number, bDur: number): number =>
  Math.max(1, Math.min(Math.round(dur), aDur, bDur));

/** 建转场:B 左移 dur 形成重叠,插记录,单 undo,选中;返回 id */
export const addTransition = (store: EditorStoreApi, fromItemId: string, toItemId: string): string => {
  const id = newId();
  store.getState().updateUndoable((s) => {
    const a = s.items[fromItemId];
    const b = s.items[toItemId];
    if (!a || !b) return s;
    const dur = clampDur(DEFAULT_TRANSITION_FRAMES, a.durationInFrames, b.durationInFrames);
    const t: Transition = { id, trackId: a.trackId, fromItemId, toItemId, type: 'fade', durationInFrames: dur };
    return {
      ...s,
      items: { ...s.items, [toItemId]: { ...b, from: a.from + a.durationInFrames - dur } },
      transitions: { ...s.transitions, [id]: t },
    };
  }, { commit: true });
  store.getState().setSelectedTransition(id);
  return id;
};

/** 调时长:clamp,并据当前 A.end 重算 B.from(维持 overlap=dur) */
export const applyTransitionDuration = (store: EditorStoreApi, id: string, dur: number, commit = true): void => {
  store.getState().updateUndoable((s) => {
    const t = s.transitions[id];
    if (!t) return s;
    const a = s.items[t.fromItemId];
    const b = s.items[t.toItemId];
    if (!a || !b) return s;
    const clamped = clampDur(dur, a.durationInFrames, b.durationInFrames);
    if (clamped === t.durationInFrames && b.from === a.from + a.durationInFrames - clamped) return s; // no-op 守卫
    return {
      ...s,
      items: { ...s.items, [t.toItemId]: { ...b, from: a.from + a.durationInFrames - clamped } },
      transitions: { ...s.transitions, [id]: { ...t, durationInFrames: clamped } },
    };
  }, { commit });
};

/** 换转场预设:写 type + direction(fade 无 direction 则删键),no-op 守卫,单 undo */
export const applyTransitionPreset = (store: EditorStoreApi, id: string, presetId: string): void => {
  const preset = TRANSITION_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  store.getState().updateUndoable((s) => {
    const t = s.transitions[id];
    if (!t) return s;
    if (t.type === preset.type && t.direction === preset.direction) return s; // no-op 守卫
    const next: Transition = { ...t, type: preset.type };
    if (preset.direction) next.direction = preset.direction;
    else delete next.direction;
    return { ...s, transitions: { ...s.transitions, [id]: next } };
  }, { commit: true });
};

/** 删转场:B 不动(变硬切) */
export const removeTransition = (store: EditorStoreApi, id: string): void => {
  store.getState().updateUndoable((s) => {
    if (!s.transitions[id]) return s;
    const rest = { ...s.transitions };
    delete rest[id];
    return { ...s, transitions: rest };
  }, { commit: true });
  if (store.getState().selectedTransitionId === id) store.getState().setSelectedTransition(null);
};
