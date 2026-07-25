import { describe, expect, it } from 'vitest';
import { createSolidItem } from '@gedatou/shared';
import { createEditorStore } from '../state/store';
import { addTransition, applyTransitionDuration, applyTransitionPreset, removeTransition } from './transition-ops';

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
  it('remove:B 贴回 A 尾部、重叠消除(还原建立时的左移)', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    expect(get().items.B.from).toBeLessThan(60); // 建立时确实左移了
    removeTransition(store, id);
    expect(get().transitions[id]).toBeUndefined();
    expect(get().items.B.from).toBe(60); // A.from(0) + A.dur(60)
  });
  it('remove:改过时长后仍贴回 A 尾部(不靠 dur 反推)', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    applyTransitionDuration(store, id, 40);
    expect(get().items.B.from).toBe(20);
    removeTransition(store, id);
    expect(get().items.B.from).toBe(60);
  });
  it('remove:后续块空隙够就不推', () => {
    const { store, get } = mk();
    const c = { ...createSolidItem({ trackId: 't', from: 200, width: 10, height: 10 }), id: 'C', durationInFrames: 30 };
    store.getState().updateUndoable((s) => ({ ...s, items: { ...s.items, C: c } }));
    const id = addTransition(store, 'A', 'B');
    removeTransition(store, id);
    expect(get().items.B.from).toBe(60);
    expect(get().items.C.from).toBe(200); // B 移回后 end=120 < 200,C 不受影响
  });
  it('remove:后续块被顶到则最小级联右推', () => {
    const { store, get } = mk();
    const c = { ...createSolidItem({ trackId: 't', from: 110, width: 10, height: 10 }), id: 'C', durationInFrames: 30 };
    const d = { ...createSolidItem({ trackId: 't', from: 145, width: 10, height: 10 }), id: 'D', durationInFrames: 30 };
    store.getState().updateUndoable((s) => ({ ...s, items: { ...s.items, C: c, D: d } }));
    const id = addTransition(store, 'A', 'B'); // B 左移到 48,end=108
    removeTransition(store, id);
    expect(get().items.B.from).toBe(60); // end=120,压住 C(110)
    expect(get().items.C.from).toBe(120); // 顺延,end=150,压住 D(145)
    expect(get().items.D.from).toBe(150);
  });
  it('remove:另一轨道的块不受影响', () => {
    const { store, get } = mk();
    const x = { ...createSolidItem({ trackId: 't2', from: 110, width: 10, height: 10 }), id: 'X', durationInFrames: 30 };
    store.getState().updateUndoable((s) => ({ ...s, items: { ...s.items, X: x } }));
    const id = addTransition(store, 'A', 'B');
    removeTransition(store, id);
    expect(get().items.X.from).toBe(110);
  });
  it('remove:移位与删记录同属一次撤销', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    const past0 = store.getState().past.length;
    removeTransition(store, id);
    expect(store.getState().past.length).toBe(past0 + 1);
    store.getState().undo();
    expect(get().transitions[id]).toBeDefined();
    expect(get().items.B.from).toBe(48); // 位置一并回滚
  });
  it('applyPreset:写 type+direction、切回 fade 删 direction 键、no-op 守卫返回原引用', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    applyTransitionPreset(store, id, 'slide-left');
    expect(get().transitions[id]).toMatchObject({ type: 'slide', direction: 'left' });
    applyTransitionPreset(store, id, 'fade');
    expect(get().transitions[id].type).toBe('fade');
    expect('direction' in get().transitions[id]).toBe(false); // 键删除,不是设 undefined
    const before = get();
    applyTransitionPreset(store, id, 'fade'); // 相同 preset → no-op
    expect(get()).toBe(before);
    applyTransitionPreset(store, id, 'nope'); // 未知 preset → no-op
    expect(get()).toBe(before);
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
