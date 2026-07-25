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
  createCaptionAsset,
  createCaptionsItem,
} from '@gedatou/shared';
import {
  addTrack,
  detachTransitionsOf,
  hasOverlap,
  maxExtendFrames,
  maxItemDurationInFrames,
  moveItems,
  removeEmptyTracks,
  resolveInsertPlacement,
  rollEdit,
  snapFrame,
  resolveSplitTargets,
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

describe('resolveInsertPlacement', () => {
  // 签名:resolveInsertPlacement(state, itemId, cursorFrom, leftFrom, targetTrack)
  test('光标在块左半 ⇒ 插到前面并把该块右推(相邻重排)', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 30); // A 0..30
    const b = solidAt(state, t1.id, 30, 30); // B 30..60(被拖)
    const ref = { kind: 'existing', id: t1.id } as const;
    // 光标 10 落在 A 左半(< A 中线 15)⇒ B 紧贴 A 左缘落 0..30,A 顺延到 30
    const r = resolveInsertPlacement(state, b.id, 10, 10, ref);
    expect(r.from).toBe(0);
    expect(r.shifts[a.id]).toBe(30);
  });
  test('光标在块右半 ⇒ 贴到该块之后,不重排', () => {
    const { state, t1 } = build();
    solidAt(state, t1.id, 0, 30); // A 0..30(邻居)
    const b = solidAt(state, t1.id, 30, 30);
    const ref = { kind: 'existing', id: t1.id } as const;
    // 光标 20 ≥ A 中线 15 ⇒ 紧贴 A 右缘落 30,无位移
    const r = resolveInsertPlacement(state, b.id, 20, 20, ref);
    expect(r.from).toBe(30);
    expect(Object.keys(r.shifts)).toHaveLength(0);
  });
  test('决策以光标为主:左缘落在别的块上,仍按光标所在块判定', () => {
    const { state, t1 } = build();
    const bb = solidAt(state, t1.id, 0, 40); // BB 0..40
    const a = solidAt(state, t1.id, 100, 100); // A 100..200
    const w = solidAt(state, t1.id, 300, 90); // W 被拖(宽)
    const ref = { kind: 'existing', id: t1.id } as const;
    // 左缘 20 落在 BB 上,但光标 110 在 A 左半 ⇒ 按 A 判定:插到 A 前(前方 40..100 不够放 90 ⇒ 贴 BB 落 40,A 右推)
    const r = resolveInsertPlacement(state, w.id, 110, 20, ref);
    expect(r.from).toBe(40);
    expect(r.shifts[a.id]).toBe(130);
    expect(r.shifts[bb.id]).toBeUndefined();
  });
  test('级联右推只在会重叠时发生,保留更大空隙', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 20); // A 0..20
    const c = solidAt(state, t1.id, 100, 20); // C 100..120(远处)
    const d = solidAt(state, t1.id, 200, 20); // D 被拖
    const ref = { kind: 'existing', id: t1.id } as const;
    // 光标 5 在 A 左半 ⇒ D 紧贴 A 左缘落 0,A 被顶到 20;C 处空隙足够,不动
    const r = resolveInsertPlacement(state, d.id, 5, 5, ref);
    expect(r.from).toBe(0);
    expect(r.shifts[a.id]).toBe(20);
    expect(r.shifts[c.id]).toBeUndefined();
  });
  test('insert 目标(新轨道)只钳帧,无重排', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 30, 30);
    const r = resolveInsertPlacement(state, a.id, 0, -5, { kind: 'insert', index: 0 });
    expect(r.from).toBe(0); // 左缘 -5 钳到 0
    expect(Object.keys(r.shifts)).toHaveLength(0);
  });
  test('光标不在任何块上 ⇒ 自由落位(停在左缘,保留空隙)', () => {
    const { state, t1 } = build();
    solidAt(state, t1.id, 0, 30); // A 0..30(邻居)
    const b = solidAt(state, t1.id, 200, 30); // B 被拖
    const ref = { kind: 'existing', id: t1.id } as const;
    // 光标 110、左缘 100 都不在 A 上 ⇒ 停在左缘 100(用左缘不用光标),保留 30..100 空隙,A 不动
    const r = resolveInsertPlacement(state, b.id, 110, 100, ref);
    expect(r.from).toBe(100);
    expect(Object.keys(r.shifts)).toHaveLength(0);
  });
  test('决策块前方空位够 ⇒ 紧贴其左缘,不推它', () => {
    const { state, t1 } = build();
    solidAt(state, t1.id, 100, 100); // A 100..200,前方 0..100 空
    const b = solidAt(state, t1.id, 300, 50); // B 被拖
    const ref = { kind: 'existing', id: t1.id } as const;
    // 光标 110 在 A 左半;前方够放 50 ⇒ B 紧贴 A 左缘落 50..100,A 不动
    const r = resolveInsertPlacement(state, b.id, 110, 110, ref);
    expect(r.from).toBe(50);
    expect(Object.keys(r.shifts)).toHaveLength(0);
  });
  test('决策块前方空位不够 ⇒ 把它右推腾位', () => {
    const { state, t1 } = build();
    const a0 = solidAt(state, t1.id, 0, 60); // A0 0..60
    const a = solidAt(state, t1.id, 80, 100); // A 80..180,前方仅 60..80 = 20
    const b = solidAt(state, t1.id, 300, 50); // B 被拖
    const ref = { kind: 'existing', id: t1.id } as const;
    // 光标 90 在 A 左半;前方 20 < 50 放不下 ⇒ B 紧贴 A0 落 60..110,A 右推到 110
    const r = resolveInsertPlacement(state, b.id, 90, 90, ref);
    expect(r.from).toBe(60);
    expect(r.shifts[a.id]).toBe(110);
    expect(r.shifts[a0.id]).toBeUndefined();
  });
});

describe('rollEdit', () => {
  test('联动：A 出点与 B 入点同移，B 结尾不动', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 50);
    const b = solidAt(state, t1.id, 50, 50);
    const next = rollEdit(state, a.id, b.id, 10);
    expect(next.items[a.id].durationInFrames).toBe(60);
    expect(next.items[b.id].from).toBe(60);
    expect(next.items[b.id].durationInFrames).toBe(40);
    const back = rollEdit(state, a.id, b.id, -10);
    expect(back.items[a.id].durationInFrames).toBe(40);
    expect(back.items[b.id].from).toBe(40);
    expect(back.items[b.id].durationInFrames).toBe(60);
  });
  test('两侧各保最小 1 帧（无缝无叠）', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 50);
    const b = solidAt(state, t1.id, 50, 50);
    const grow = rollEdit(state, a.id, b.id, 500);
    expect(grow.items[a.id].durationInFrames).toBe(99);
    expect(grow.items[b.id].from).toBe(99);
    expect(grow.items[b.id].durationInFrames).toBe(1);
    const shrink = rollEdit(state, a.id, b.id, -500);
    expect(shrink.items[a.id].durationInFrames).toBe(1);
    expect(shrink.items[b.id].from).toBe(1);
    expect(shrink.items[b.id].durationInFrames).toBe(99);
  });
  test('A 为媒体：出点不能超素材末尾；delta 0 时引用不变', () => {
    const { state, t1 } = build();
    // 素材 300 帧全占 ⇒ A 无法再扩展
    const { item: a } = addVideo(state, t1.id, { from: 0, durationInFrames: 300 });
    const b = solidAt(state, t1.id, 300, 50);
    expect(rollEdit(state, a.id, b.id, 10)).toBe(state);
    const shrunk = rollEdit(state, a.id, b.id, -20);
    expect(shrunk.items[a.id].durationInFrames).toBe(280);
    expect(shrunk.items[b.id].from).toBe(280);
    expect(shrunk.items[b.id].durationInFrames).toBe(70);
  });
  test('B 为媒体：trimBefore=0 时入点无法左移；右移增加 trimBefore', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 60);
    const { item: b } = addVideo(state, t1.id, { from: 60, trimBefore: 0 });
    expect(rollEdit(state, a.id, b.id, -10)).toBe(state);
    const next = rollEdit(state, a.id, b.id, 10);
    expect(next.items[a.id].durationInFrames).toBe(70);
    expect(next.items[b.id].from).toBe(70);
    expect((next.items[b.id] as VideoItem).trimBefore).toBe(10);
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
  test('视频分割：左半清淡出+音频淡出，右半清淡入+音频淡入，另一侧保留', () => {
    const { state, t1 } = build();
    const { item } = addVideo(state, t1.id, {
      from: 10,
      durationInFrames: 60,
      fadeInDurationInFrames: 10,
      fadeOutDurationInFrames: 12,
      audioFadeInDurationInFrames: 8,
      audioFadeOutDurationInFrames: 9,
    });
    const next = splitItemsAtFrame(state, 30, [item.id]);
    const parts = Object.values(next.items) as VideoItem[];
    const left = parts.find((p) => p.from === 10)!;
    const right = parts.find((p) => p.from === 30)!;
    expect(left.fadeOutDurationInFrames).toBe(0);
    expect(left.audioFadeOutDurationInFrames).toBe(0);
    expect(left.fadeInDurationInFrames).toBe(10);
    expect(left.audioFadeInDurationInFrames).toBe(8);
    expect(right.fadeInDurationInFrames).toBe(0);
    expect(right.audioFadeInDurationInFrames).toBe(0);
    expect(right.fadeOutDurationInFrames).toBe(12);
    expect(right.audioFadeOutDurationInFrames).toBe(9);
  });
  test('帧在项外不变', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 10, 30);
    expect(splitItemsAtFrame(state, 5, [a.id])).toBe(state);
    expect(splitItemsAtFrame(state, 40, [a.id])).toBe(state);
  });
});

describe('resolveSplitTargets', () => {
  test('有选中直接用选中', () => {
    const { state, t1 } = build();
    const a = solidAt(state, t1.id, 0, 30);
    solidAt(state, t1.id, 40, 30);
    expect(resolveSplitTargets(state, 50, [a.id])).toEqual([a.id]);
  });
  test('未选中取播放头下所有条目（边界帧不算）', () => {
    const { state, t1, t2 } = build();
    const a = solidAt(state, t1.id, 0, 30);
    const b = solidAt(state, t2.id, 10, 30);
    solidAt(state, t1.id, 40, 30);
    expect(resolveSplitTargets(state, 15, []).sort()).toEqual([a.id, b.id].sort());
    // from 与结尾帧正好落在边界的不切
    expect(resolveSplitTargets(state, 40, [])).toEqual([]);
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

describe('maxExtendFrames', () => {
  test('左 = min(trimBefore 换算, from)；右 = 素材剩余', () => {
    const { state, t1 } = build();
    // 素材 300 帧；trimBefore=60、from=30、dur=100 ⇒ 左 min(60,30)=30，右 300-60-100=140
    const { item } = addVideo(state, t1.id, { from: 30, trimBefore: 60, durationInFrames: 100 });
    expect(maxExtendFrames(state, item.id)).toEqual({ left: 30, right: 140 });
  });
  test('playbackRate 换算；非有限媒体 null', () => {
    const { state, t1 } = build();
    // 左 floor(60/2)=30；最大时长 floor((300-60)/2)=120 ⇒ 右 120-50=70
    const { item } = addVideo(state, t1.id, {
      from: 100,
      trimBefore: 60,
      playbackRate: 2,
      durationInFrames: 50,
    });
    expect(maxExtendFrames(state, item.id)).toEqual({ left: 30, right: 70 });
    const t = createTextItem({ trackId: t1.id, from: 0 });
    state.items[t.id] = t;
    expect(maxExtendFrames(state, t.id)).toBeNull();
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

describe('detachTransitionsOf', () => {
  const mkT = (id: string, fromItemId: string, toItemId: string) => ({
    id,
    trackId: 't',
    fromItemId,
    toItemId,
    type: 'fade' as const,
    durationInFrames: 12,
  });
  const table = { ab: mkT('ab', 'A', 'B'), bc: mkT('bc', 'B', 'C') };

  test('拖 from 侧 ⇒ 该转场断开', () => {
    expect(Object.keys(detachTransitionsOf(table, 'A'))).toEqual(['bc']);
  });
  test('拖 to 侧 ⇒ 该转场断开', () => {
    expect(Object.keys(detachTransitionsOf(table, 'C'))).toEqual(['ab']);
  });
  test('两侧都参与(A-B 与 B-C 的 B)⇒ 两个都断开', () => {
    expect(detachTransitionsOf(table, 'B')).toEqual({});
  });
  test('与转场无关的块 ⇒ 返回原引用(不触发无谓写)', () => {
    expect(detachTransitionsOf(table, 'Z')).toBe(table);
  });
});

// 字幕绑定源块后，trim 源块时字幕跟着裁（sourceItemId）
describe('trimItem 联动绑定的字幕', () => {
  const buildBound = () => {
    const { state, t1, t2 } = build();
    const { item: video } = addVideo(state, t1.id); // from 0, 60 帧
    const asset = createCaptionAsset({
      captions: [
        { text: 'a', startMs: 0, endMs: 500, timestampMs: 0, confidence: null },
        { text: ' b', startMs: 1000, endMs: 1500, timestampMs: 1000, confidence: null },
      ],
    });
    state.assets[asset.id] = asset;
    const cap = createCaptionsItem({
      trackId: t2.id,
      from: 0,
      assetId: asset.id,
      durationInFrames: 60,
      sourceItemId: video.id,
      compositionWidth: 1080,
      compositionHeight: 1920,
    });
    state.items[cap.id] = cap;
    return { state, videoId: video.id, capId: cap.id, assetId: asset.id };
  };

  test('右侧裁短 ⇒ 字幕块同步缩短，内容不动', () => {
    const { state, videoId, capId, assetId } = buildBound();
    const next = trimItem(state, videoId, 'end', -20);
    expect(next.items[videoId].durationInFrames).toBe(40);
    expect(next.items[capId].durationInFrames).toBe(40);
    expect(next.items[capId].from).toBe(0);
    const a = next.assets[assetId];
    expect(a.type === 'caption' && a.captions[0].startMs).toBe(0); // 起点没变 ⇒ 内容无需平移
  });

  test('左侧裁短 ⇒ 字幕块头右移、时长缩短，内容整体前移', () => {
    const { state, videoId, capId, assetId } = buildBound();
    const next = trimItem(state, videoId, 'start', 30); // 30 帧 = 1000ms @30fps
    expect(next.items[capId].from).toBe(30);
    expect(next.items[capId].durationInFrames).toBe(30);
    const a = next.assets[assetId];
    if (a.type !== 'caption') throw new Error('not caption');
    expect(a.captions[0].startMs).toBe(-1000); // 被裁掉的那条移到负时间，渲染时不出现
    expect(a.captions[1].startMs).toBe(0); // 原 1000ms 的条目提到块首
  });

  test('左侧裁掉再拉回 ⇒ 字幕原样回来（无损）', () => {
    const { state, videoId, capId, assetId } = buildBound();
    const cut = trimItem(state, videoId, 'start', 30);
    const back = trimItem(cut, videoId, 'start', -30);
    expect(back.items[capId].from).toBe(0);
    expect(back.items[capId].durationInFrames).toBe(60);
    const a = back.assets[assetId];
    if (a.type !== 'caption') throw new Error('not caption');
    expect(a.captions.map((c) => c.startMs)).toEqual([0, 1000]);
  });

  test('没绑定的字幕不受 trim 影响', () => {
    const { state, videoId, capId } = buildBound();
    delete (state.items[capId] as { sourceItemId?: string }).sourceItemId;
    const next = trimItem(state, videoId, 'end', -20);
    expect(next.items[capId].durationInFrames).toBe(60);
  });
});
