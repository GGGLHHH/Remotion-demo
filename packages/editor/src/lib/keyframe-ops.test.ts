import { describe, expect, it } from 'vitest';
import { createSolidItem } from '@gedatou/shared';
import { createEditorStore } from '../state/store';
import { applyAnimationPreset, clearKeyframes, moveKeyframe, setKeyframeValue, toggleKeyframe } from './keyframe-ops';

const mk = () => {
  const store = createEditorStore();
  const item = { ...createSolidItem({ trackId: 't', from: 0, width: 100, height: 100 }), left: 10, opacity: 1, durationInFrames: 60 };
  store.getState().updateUndoable((s) => ({ ...s, items: { ...s.items, [item.id]: item } }));
  return { store, id: item.id, get: () => store.getState().undoable.items[item.id] };
};

describe('keyframe-ops', () => {
  it('toggle 加(值=当前静态)再删', () => {
    const { store, id, get } = mk();
    toggleKeyframe(store, id, 'left', 5);
    expect(get().keyframes!.left).toEqual([{ frame: 5, value: 10, easing: 'easeInOut' }]);
    toggleKeyframe(store, id, 'left', 5);
    expect(get().keyframes).toBeUndefined();
  });
  it('setKeyframeValue upsert 保持升序', () => {
    const { store, id, get } = mk();
    setKeyframeValue(store, id, 'left', 10, 100);
    setKeyframeValue(store, id, 'left', 0, 0);
    expect(get().keyframes!.left!.map((k) => k.frame)).toEqual([0, 10]);
  });
  it('move 改帧;frame clamp 到 [0,dur]', () => {
    const { store, id, get } = mk();
    setKeyframeValue(store, id, 'left', 5, 1);
    moveKeyframe(store, id, 'left', 5, 999);
    expect(get().keyframes!.left![0].frame).toBe(60);
  });
  it('clear 回退静态(去 keyframes)', () => {
    const { store, id, get } = mk();
    setKeyframeValue(store, id, 'left', 5, 1);
    clearKeyframes(store, id, 'left');
    expect(get().keyframes).toBeUndefined();
  });
  it('applyPreset fadeIn 写 opacity 两帧', () => {
    const { store, id, get } = mk();
    applyAnimationPreset(store, id, 'fadeIn');
    expect(get().keyframes!.opacity).toHaveLength(2);
  });
  it('commit:false 不进 undo,commitPending 收 1 条', () => {
    const { store, id } = mk();
    const past0 = store.getState().past.length;
    setKeyframeValue(store, id, 'left', 5, 1, false);
    expect(store.getState().past.length).toBe(past0); // 未提交
    store.getState().commitPending();
    expect(store.getState().past.length).toBe(past0 + 1);
  });
});
