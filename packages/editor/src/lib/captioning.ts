import {
  createCaptionAsset,
  createCaptionsItem,
  newId,
  type Caption,
  type EditorStarterItem,
  type UndoableState,
} from '@gedatou/shared';
import type { EditorStoreApi } from '../state/store';
import type { EditorDeps } from '../state/runtime';
import { addTrack } from '../timeline/ops';
import { extractWav } from './extract-audio';
import { parseSubtitles } from './subtitle-io';
import { tFor } from './i18n-core';

/** 源 item 在素材内的可听片段（素材原速秒）：偏移 trimBefore，长度 = item 时长 × 变速率 */
export const audibleSegment = (
  item: { trimBefore: number; playbackRate: number; durationInFrames: number },
  fps: number,
): { offsetSec: number; durationSec: number } => ({
  offsetSec: item.trimBefore / fps,
  durationSec: (item.durationInFrames / fps) * item.playbackRate,
});

/** 转录 token 时间相对片段起点（素材原速）→ 除以变速率，对齐 item 时间轴 */
export const remapCaptionTimes = (captions: Caption[], playbackRate: number): Caption[] =>
  captions.map((c) => ({
    ...c,
    startMs: c.startMs / playbackRate,
    endMs: c.endMs / playbackRate,
    timestampMs: c.timestampMs === null ? null : c.timestampMs / playbackRate,
  }));

/**
 * 把一组 caption 落成时间轴上的字幕块：新轨、对齐源 item 的起点、时长取「源时长」与「字幕末尾」的较大者。
 * 取较大者是为导入准备的 —— 外部 .srt 可能比这一段素材长，按源时长裁会把后面的字幕吞掉。
 * whisper 那条路转的就是本段音频，字幕不会越界，max 对它等同于原来的 src.durationInFrames。
 */
const attachCaptions = (
  s: UndoableState,
  src: EditorStarterItem,
  captions: Caption[],
  filename: string,
): UndoableState => {
  const { state: withTrack, trackId } = addTrack(s, 0);
  const asset = createCaptionAsset({ captions, filename });
  // captions 为空时 Math.max(...[]) = -Infinity，被外层 max 吃掉，退回源时长
  const capEnd = Math.ceil((Math.max(...captions.map((c) => c.endMs)) / 1000) * s.fps);
  const capItem = createCaptionsItem({
    trackId,
    assetId: asset.id,
    from: src.from,
    sourceItemId: src.id,
    durationInFrames: Math.max(src.durationInFrames, capEnd),
    compositionWidth: s.compositionWidth,
    compositionHeight: s.compositionHeight,
  });
  return {
    ...withTrack,
    assets: { ...withTrack.assets, [asset.id]: asset },
    items: { ...withTrack.items, [capItem.id]: capItem },
  };
};

/**
 * 用现成的 .srt/.vtt 为某个 item 建字幕块 —— 与「生成字幕」并列的第二条路。
 * 适用场景：素材没音轨、whisper 不可用（如容器里没装编译链）、或字幕已在别处定过稿。
 * 时间按文件原样走，不做 trim/变速重映射：外部字幕是相对成片时间轴写的，不是相对素材原速。
 */
export const importCaptionsForItem = async (
  store: EditorStoreApi,
  deps: EditorDeps,
  itemId: string,
  file: File,
): Promise<void> => {
  const t = tFor(deps);
  const captions = parseSubtitles(await file.text());
  if (!captions.length) {
    deps.notify(t('captioning.importEmpty'), 'error');
    return;
  }
  store.getState().updateUndoable((s) => {
    const src = s.items[itemId];
    return src ? attachCaptions(s, src, captions, file.name) : s;
  });
  deps.notify(t('captioning.imported', { count: captions.length }), 'success');
};

/** 为 video(hasAudio)/audio item 生成字幕：抽 item 可听片段 → 服务端 whisper 转录 → 建 CaptionAsset + CaptionsItem。
 * 片段截取 + token 时间重映射保证 trim/变速后的字幕仍与 item 时间轴对齐 */
export const generateCaptions = async (
  store: EditorStoreApi,
  deps: EditorDeps,
  itemId: string,
): Promise<void> => {
  const t = tFor(deps);
  const state = store.getState();
  const item = state.undoable.items[itemId];
  if (!item || (item.type !== 'video' && item.type !== 'audio')) return;
  const url = state.localUrls[item.assetId] ?? state.undoable.assets[item.assetId]?.url;
  if (!url) return;
  const srcFilename = state.undoable.assets[item.assetId]?.filename ?? 'audio';

  const taskId = newId();
  const upsert = (status: 'extracting' | 'transcribing' | 'done' | 'error', error?: string) =>
    store.getState().upsertCaptioningTask({ id: taskId, itemId, status, error });

  try {
    upsert('extracting');
    const wav = await extractWav(url, audibleSegment(item, state.undoable.fps));
    upsert('transcribing');
    const { captions: rawCaptions } = await deps.transport.generateCaptions(wav);
    const captions = remapCaptionTimes(rawCaptions, item.playbackRate);

    store.getState().updateUndoable((s) =>
      // 源 item 可能在转录期间被改动/删除；时间对齐取当前值，删了就用发起时的快照
      attachCaptions(s, s.items[itemId] ?? item, captions, `${srcFilename}.captions.json`),
    );
    upsert('done');
    deps.notify(t('captioning.generated'), 'success');
  } catch (err) {
    console.error('生成字幕失败', err);
    upsert('error', String(err));
    deps.notify(t('captioning.generateFailed'), 'error');
  }
};
