import { newId, type Caption, type CaptionAsset, type CaptionsItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { addTrack } from '../timeline/ops';
import { extractWav } from './extract-audio';

/** 为 video(hasAudio)/audio item 生成字幕：抽音频 → 服务端 whisper 转录 → 建 CaptionAsset + CaptionsItem */
export const generateCaptions = async (itemId: string): Promise<void> => {
  const store = useEditorStore.getState();
  const item = store.undoable.items[itemId];
  if (!item || (item.type !== 'video' && item.type !== 'audio')) return;
  const url = store.localUrls[item.assetId] ?? store.undoable.assets[item.assetId]?.url;
  if (!url) return;
  const srcFilename = store.undoable.assets[item.assetId]?.filename ?? 'audio';

  const taskId = newId();
  const upsert = (status: 'extracting' | 'transcribing' | 'done' | 'error', error?: string) =>
    useEditorStore.getState().upsertCaptioningTask({ id: taskId, itemId, status, error });

  try {
    upsert('extracting');
    const wav = await extractWav(url);
    upsert('transcribing');
    const form = new FormData();
    form.append('file', wav, 'audio.wav');
    const res = await fetch('/api/captions', { method: 'POST', body: form });
    if (!res.ok) throw new Error(`转录失败: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const { captions } = (await res.json()) as { captions: Caption[] };

    useEditorStore.getState().updateUndoable((s) => {
      // 源 item 可能在转录期间被改动/删除；时间对齐取当前值，删了就用发起时的快照
      const src = s.items[itemId] ?? item;
      const { state: withTrack, trackId } = addTrack(s, 0);
      const width = Math.round(s.compositionWidth * 0.8);
      const asset: CaptionAsset = {
        id: newId(),
        type: 'caption',
        url: '', // 字幕数据直接内联在 state，不走对象存储
        filename: `${srcFilename}.captions.json`,
        sizeInBytes: 0,
        captions,
      };
      const capItem: CaptionsItem = {
        id: newId(),
        type: 'captions',
        trackId,
        assetId: asset.id,
        from: src.from,
        durationInFrames: src.durationInFrames,
        left: Math.round((s.compositionWidth - width) / 2),
        top: s.compositionHeight - 320,
        width,
        height: 200,
        rotation: 0,
        opacity: 1,
        borderRadius: 0,
        fadeInDurationInFrames: 0,
        fadeOutDurationInFrames: 0,
        highlightColor: '#facc15',
        pageDurationInMs: 1200,
        maxLines: 2,
        fontFamily: 'Inter',
        fontWeight: '700',
        fontStyle: 'normal',
        fontSize: 64,
        color: '#ffffff',
        strokeWidth: 0,
        strokeColor: '#000000',
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: 'center',
        direction: 'ltr',
      };
      return {
        ...withTrack,
        assets: { ...withTrack.assets, [asset.id]: asset },
        items: { ...withTrack.items, [capItem.id]: capItem },
      };
    });
    upsert('done');
  } catch (err) {
    console.error('生成字幕失败', err);
    upsert('error', String(err));
  }
};
