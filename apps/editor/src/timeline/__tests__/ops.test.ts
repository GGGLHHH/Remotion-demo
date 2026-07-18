import { describe, expect, test } from 'vitest';
import {
  createEmptyState,
  createSolidItem,
  createTextItem,
  createTrack,
  newId,
  type UndoableState,
  type VideoAsset,
  type VideoItem,
} from '@editor/shared';
import {
  addTrack,
  hasOverlap,
  maxItemDurationInFrames,
  moveItems,
  removeEmptyTracks,
  snapFrame,
  splitItemsAtFrame,
  trimItem,
} from '../ops';

const solidAt = (state: UndoableState, trackId: string, from: number, dur: number) => {
  const item = createSolidItem({ trackId, from, width: 100, height: 100 });
  item.durationInFrames = dur;
  state.items[item.id] = item;
  return item;
};

const build = () => {
  const state = createEmptyState({ width: 1080, height: 1920 });
  const t1 = createTrack('T1');
  const t2 = createTrack('T2');
  state.tracks = [t1, t2];
  return { state, t1, t2 };
};

const addVideo = (state: UndoableState, trackId: string, opts?: Partial<VideoItem>) => {
  const asset: VideoAsset = {
    id: newId(),
    type: 'video',
    url: 'blob:x',
    filename: 'v.mp4',
    sizeInBytes: 1,
    width: 1920,
    height: 1080,
    durationInSeconds: 10,
    hasAudio: true,
  };
  state.assets[asset.id] = asset;
  const item: VideoItem = {
    id: newId(),
    type: 'video',
    trackId,
    assetId: asset.id,
    from: 0,
    durationInFrames: 60,
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    borderRadius: 0,
    fadeInDurationInFrames: 0,
    fadeOutDurationInFrames: 0,
    crop: null,
    trimBefore: 0,
    playbackRate: 1,
    volume: 1,
    muted: false,
    ...opts,
  };
  state.items[item.id] = item;
  return { asset, item };
};

describe('hasOverlap', () => {
  test('相邻不算重叠，交叠算', () => {
    const { state, t1 } = build();
    solidAt(state, t1.id, 0, 30);
    expect(hasOverlap(state, t1.id, 30, 30, [])).toBe(false);
    expect(hasOverlap(state, t1.id, 29, 30, [])).toBe(true);
  });
  test('ignoreIds 生效', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 30);
    expect(hasOverlap(state, t1.id, 10, 30, [a.id])).toBe(false);
  });
});

describe('moveItems', () => {
  test('合法移动生效、跨轨道', () => {
    const { state, t1, t2 } = build();
    const a = solidAt(state, t1.id, 0, 30);
    const next = moveItems(state, [{ id: a.id, trackId: t2.id, from: 100 }]);
    expect(next.items[a.id].from).toBe(100);
    expect(next.items[a.id].trackId).toBe(t2.id);
  });
  test('冲突/负 from 回弹（引用不变）', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 30);
    const b = solidAt(state, t1.id, 50, 30);
    expect(moveItems(state, [{ id: a.id, trackId: t1.id, from: 40 }])).toBe(state);
    expect(moveItems(state, [{ id: b.id, trackId: t1.id, from: -5 }])).toBe(state);
  });
  test('多项整体移动内部互不算冲突', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 30);
    const b = solidAt(state, t1.id, 30, 30);
    const next = moveItems(state, [
      { id: a.id, trackId: t1.id, from: 10 },
      { id: b.id, trackId: t1.id, from: 40 },
    ]);
    expect(next.items[a.id].from).toBe(10);
    expect(next.items[b.id].from).toBe(40);
  });
});

describe('trimItem', () => {
  test('start：from/dur/trimBefore 联动', () => {
    const { state, t1 } = build();
    const { item } = addVideo(state, t1.id, { from: 30, trimBefore: 5 });
    const next = trimItem(state, item.id, 'start', 10);
    const it = next.items[item.id] as VideoItem;
    expect(it.from).toBe(40);
    expect(it.durationInFrames).toBe(50);
    expect(it.trimBefore).toBe(15);
  });
  test('start：trimBefore 钳到 0（不能露出素材开头之前）', () => {
    const { state, t1 } = build();
    const { item } = addVideo(state, t1.id, { from: 30, trimBefore: 5 });
    const next = trimItem(state, item.id, 'start', -10);
    const it = next.items[item.id] as VideoItem;
    expect(it.trimBefore).toBe(0);
    expect(it.from).toBe(25);
    expect(it.durationInFrames).toBe(65);
  });
  test('end：媒体项钳到素材剩余长度', () => {
    const { state, t1 } = build();
    // 10s @30fps = 300 帧素材；trimBefore=100 ⇒ 剩 200
    const { item } = addVideo(state, t1.id, { trimBefore: 100, durationInFrames: 60 });
    const next = trimItem(state, item.id, 'end', 500);
    expect(next.items[item.id].durationInFrames).toBe(200);
  });
  test('end：文本无上限、最小 1', () => {
    const { state, t1 } = build();
    const a = createTextItem({ trackId: t1.id, from: 0 });
    a.durationInFrames = 30;
    state.items[a.id] = a;
    expect(trimItem(state, a.id, 'end', 1000).items[a.id].durationInFrames).toBe(1030);
    expect(trimItem(state, a.id, 'end', -100).items[a.id].durationInFrames).toBe(1);
  });
});

describe('splitItemsAtFrame', () => {
  test('分割保持总长，右半 trimBefore 顺延', () => {
    const { state, t1 } = build();
    const { item } = addVideo(state, t1.id, { from: 10, durationInFrames: 60, trimBefore: 5 });
    const next = splitItemsAtFrame(state, 30, [item.id]);
    const parts = Object.values(next.items).filter((i) => i.trackId === t1.id);
    expect(parts).toHaveLength(2);
    const left = parts.find((p) => p.from === 10)!;
    const right = parts.find((p) => p.from === 30)!;
    expect(left.durationInFrames + right.durationInFrames).toBe(60);
    expect((right as VideoItem).trimBefore).toBe(5 + 20);
  });
  test('帧在项外不变', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 10, 30);
    expect(splitItemsAtFrame(state, 5, [a.id])).toBe(state);
    expect(splitItemsAtFrame(state, 40, [a.id])).toBe(state);
  });
});

describe('snapFrame', () => {
  test('容差内吸到端点/0/播放头', () => {
    const { state, t1 } = build();
    solidAt(state, t1.id, 100, 50); // 端点 100、150
    expect(snapFrame(state, 98, 5)).toBe(100);
    expect(snapFrame(state, 152, 5)).toBe(150);
    expect(snapFrame(state, 3, 5)).toBe(0);
    expect(snapFrame(state, 71, 5, { playheadFrame: 70 })).toBe(70);
  });
  test('容差外原样；ignoreIds 排除自身', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 100, 50);
    expect(snapFrame(state, 90, 5)).toBe(90);
    expect(snapFrame(state, 98, 5, { ignoreIds: [a.id] })).toBe(98);
  });
});

describe('tracks', () => {
  test('addTrack 插入指定位置', () => {
    const { state } = build();
    const { state: next, trackId } = addTrack(state, 1);
    expect(next.tracks[1].id).toBe(trackId);
    expect(next.tracks).toHaveLength(3);
  });
  test('removeEmptyTracks 保留有内容的和至少一条', () => {
    const { state, t2 } = build();
    solidAt(state, t2.id, 0, 30);
    const next = removeEmptyTracks(state);
    expect(next.tracks).toHaveLength(1);
    expect(next.tracks[0].id).toBe(t2.id);
  });
});

describe('maxItemDurationInFrames', () => {
  test('video 按 rate 换算；text null', () => {
    const { state, t1 } = build();
    const { item } = addVideo(state, t1.id, { playbackRate: 2 });
    expect(maxItemDurationInFrames(state, item.id)).toBe(150);
    const t = createTextItem({ trackId: t1.id, from: 0 });
    state.items[t.id] = t;
    expect(maxItemDurationInFrames(state, t.id)).toBeNull();
  });
});
