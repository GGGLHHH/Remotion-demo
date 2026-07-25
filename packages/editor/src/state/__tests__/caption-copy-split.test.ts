import { beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
  createCaptionAsset,
  createCaptionsItem,
  createEmptyState,
  createSolidItem,
  createTrack,
} from '@gedatou/shared';
import { createEditorStore, type EditorStoreApi } from '../store';
import { duplicateSelection } from '../../lib/clipboard';
import { splitItemsAtFrame } from '../../timeline/ops';

// 字幕块不是普通素材块：它的 asset 装的是「这个块的内容」。复制/切分时若沿用素材块那套
// （共享 asset、原样带 sourceItemId），就会出现「删原视频副本一起没」「右半从头重播」。

const build = () => {
  const s = createEmptyState({ width: DEFAULT_COMPOSITION_WIDTH, height: DEFAULT_COMPOSITION_HEIGHT });
  const track = createTrack('T0');
  s.tracks.push(track);
  const src = createSolidItem({ trackId: track.id, from: 0, width: 10, height: 10 });
  src.durationInFrames = 60;
  s.items[src.id] = src;
  const asset = createCaptionAsset({
    captions: [
      { text: 'first', startMs: 0, endMs: 900, timestampMs: 0, confidence: null },
      { text: ' second', startMs: 1000, endMs: 1900, timestampMs: 1000, confidence: null },
    ],
  });
  s.assets[asset.id] = asset;
  const cap = createCaptionsItem({
    trackId: track.id,
    from: 0,
    assetId: asset.id,
    durationInFrames: 60,
    sourceItemId: src.id,
    compositionWidth: s.compositionWidth,
    compositionHeight: s.compositionHeight,
  });
  s.items[cap.id] = cap;
  return { s, srcId: src.id, capId: cap.id, assetId: asset.id };
};

describe('复制字幕块', () => {
  let api: EditorStoreApi;
  let built: ReturnType<typeof build>;
  beforeEach(() => {
    api = createEditorStore();
    built = build();
    api.setState({ undoable: built.s });
  });

  const copyIdOf = () =>
    Object.keys(api.getState().undoable.items).find((i) => i !== built.srcId && i !== built.capId)!;

  test('副本不再绑原视频 ⇒ 删原视频不会连带删掉副本', () => {
    api.getState().setSelected([built.capId]);
    duplicateSelection(api);
    const copyId = copyIdOf();
    const copy = api.getState().undoable.items[copyId];
    expect(copy.type === 'captions' && copy.sourceItemId).toBeUndefined();

    api.getState().setSelected([built.srcId]);
    api.getState().deleteSelected();
    expect(api.getState().undoable.items[copyId]).toBeDefined();
  });

  test('副本拿到独立的字幕数据 ⇒ 改副本不影响原块', () => {
    api.getState().setSelected([built.capId]);
    duplicateSelection(api);
    const copy = api.getState().undoable.items[copyIdOf()];
    if (copy.type !== 'captions') throw new Error('not captions');
    expect(copy.assetId).not.toBe(built.assetId);

    api.getState().updateUndoable((s) => {
      const a = s.assets[copy.assetId];
      if (a.type !== 'caption') return s;
      return { ...s, assets: { ...s.assets, [copy.assetId]: { ...a, captions: [] } } };
    });
    const orig = api.getState().undoable.assets[built.assetId];
    expect(orig.type === 'caption' && orig.captions).toHaveLength(2);
  });

  test('源块与字幕一起复制 ⇒ 副本字幕改绑副本源', () => {
    api.getState().setSelected([built.srcId, built.capId]);
    duplicateSelection(api);
    const items = api.getState().undoable.items;
    const newIds = Object.keys(items).filter((i) => i !== built.srcId && i !== built.capId);
    const copyCap = newIds.map((i) => items[i]).find((i) => i.type === 'captions');
    const copySrc = newIds.map((i) => items[i]).find((i) => i.type === 'solid');
    expect(copyCap?.type === 'captions' && copyCap.sourceItemId).toBe(copySrc?.id);
  });
});

describe('切分字幕块', () => {
  test('两半各拿一份数据，右半内容按切点平移', () => {
    const { s, capId } = build();
    const next = splitItemsAtFrame(s, 30, [capId]); // 30 帧 = 1 秒
    const halves = Object.values(next.items).filter((i) => i.type === 'captions');
    expect(halves).toHaveLength(2);
    expect(halves[0].assetId).not.toBe(halves[1].assetId);

    const right = halves.find((h) => h.from === 30)!;
    const rAsset = next.assets[right.assetId];
    if (rAsset.type !== 'caption') throw new Error('not caption');
    // 右半相对自己的起点计时：原 1000ms 的 second 落到 0，原 0ms 的 first 退到 -1000（不显示但留着）
    expect(rAsset.captions.map((c) => [c.text, c.startMs])).toEqual([
      ['first', -1000],
      [' second', 0],
    ]);
    const lAsset = next.assets[halves.find((h) => h.from === 0)!.assetId];
    expect(lAsset.type === 'caption' && lAsset.captions[0].startMs).toBe(0); // 左半不动
  });

  test('切源块 ⇒ 绑定的字幕在同一处一起切，右半字幕改绑右半源', () => {
    const { s, srcId, capId } = build();
    const next = splitItemsAtFrame(s, 30, [srcId]); // 只选中源块
    const caps = Object.values(next.items).filter((i) => i.type === 'captions');
    expect(caps).toHaveLength(2); // 字幕被连带切开
    const rightCap = caps.find((c) => c.from === 30)!;
    expect(rightCap.type === 'captions' && rightCap.sourceItemId).toBe(`${srcId}-r30`);
    expect(next.items[`${srcId}-r30`]).toBeDefined();
    const leftCap = caps.find((c) => c.from === 0)!;
    expect(leftCap.type === 'captions' && leftCap.sourceItemId).toBe(srcId);
    expect(leftCap.id).toBe(capId);
  });
});
