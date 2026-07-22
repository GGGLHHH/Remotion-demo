import { describe, expect, it } from 'vitest';
import { createSolidItem } from '@gedatou/shared';
import { createEditorStore } from '../state/store';
import { addTransition, applyTransitionDuration, removeTransition } from './transition-ops';

const mk = () => {
  const store = createEditorStore();
  const a = { ...createSolidItem({ trackId: 't', from: 0, width: 10, height: 10 }), id: 'A', durationInFrames: 60 };
  const b = { ...createSolidItem({ trackId: 't', from: 60, width: 10, height: 10 }), id: 'B', durationInFrames: 60 };
  store.getState().updateUndoable((s) => ({ ...s, items: { A: a, B: b } }));
  return { store, get: () => store.getState().undoable };
};

describe('transition-ops', () => {
  it('add:B 左移 dur、插记录、单 undo、选中', () => {
    const { store, get } = mk();
    const past0 = store.getState().past.length;
    const id = addTransition(store, 'A', 'B');
    const t = get().transitions[id];
    expect(t).toMatchObject({ fromItemId: 'A', toItemId: 'B', type: 'fade' });
    expect(get().items.B.from).toBe(60 - t.durationInFrames); // 左移
    expect(store.getState().past.length).toBe(past0 + 1);
    expect(store.getState().selectedTransitionId).toBe(id);
  });
  it('applyDuration:clamp [1,min(aDur,bDur)] 且重算 B.from', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    applyTransitionDuration(store, id, 999);
    expect(get().transitions[id].durationInFrames).toBe(60); // clamp 到 min(60,60)
    expect(get().items.B.from).toBe(0); // A.end(60) - 60
  });
  it('remove:删记录、B 不动(硬切)', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    const bFrom = get().items.B.from;
    removeTransition(store, id);
    expect(get().transitions[id]).toBeUndefined();
    expect(get().items.B.from).toBe(bFrom);
  });
  it('删 item 连带删转场(孤儿清理)', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    store.getState().setSelected(['A']);
    store.getState().deleteSelected();
    expect(get().transitions[id]).toBeUndefined();
    expect(get().items.A).toBeUndefined();
  });
});
