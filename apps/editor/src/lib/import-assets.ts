import { toast } from 'sonner';
import {
  MAX_FILE_UPLOAD_SIZE_IN_MB,
  newId,
  type EditorStarterAsset,
  type EditorStarterItem,
} from '@editor/shared';
import { useEditorStore } from '../state/store';
import { playerRef } from '../canvas/player-ref';
import { addTrack, hasOverlap } from '../timeline/ops';
import { cacheAsset } from '../caching/indexeddb';
import { probeFile, type ProbeResult } from './probe';

const itemBaseDefaults = {
  rotation: 0,
  opacity: 1,
  borderRadius: 0,
  fadeInDurationInFrames: 0,
  fadeOutDurationInFrames: 0,
};

const mediaDefaults = { trimBefore: 0, playbackRate: 1 };
const audioDefaults = { volume: 1, muted: false };

/** 视觉素材按合成尺寸等比缩放，居中或以落点为中心 */
const placeVisual = (
  probe: { width: number; height: number },
  compW: number,
  compH: number,
  dropAt?: { x: number; y: number },
) => {
  const scale = Math.min(compW / probe.width, compH / probe.height, 1);
  const width = Math.round(probe.width * scale);
  const height = Math.round(probe.height * scale);
  const cx = dropAt?.x ?? compW / 2;
  const cy = dropAt?.y ?? compH / 2;
  return { width, height, left: Math.round(cx - width / 2), top: Math.round(cy - height / 2) };
};

const buildAssetAndItem = (
  probe: ProbeResult,
  file: File,
  blobUrl: string,
  params: { trackId: string; from: number; fps: number; compW: number; compH: number; dropAt?: { x: number; y: number } },
): { asset: EditorStarterAsset; item: EditorStarterItem } => {
  const assetId = newId();
  const base = { id: assetId, url: blobUrl, filename: file.name, sizeInBytes: file.size };
  const itemBase = {
    ...itemBaseDefaults,
    id: newId(),
    trackId: params.trackId,
    from: params.from,
    assetId,
  };
  switch (probe.kind) {
    case 'video': {
      const place = placeVisual(probe, params.compW, params.compH, params.dropAt);
      return {
        asset: { ...base, type: 'video', width: probe.width, height: probe.height, durationInSeconds: probe.durationInSeconds, hasAudio: probe.hasAudio },
        item: {
          ...itemBase,
          ...place,
          ...mediaDefaults,
          ...audioDefaults,
          type: 'video',
          crop: null,
          durationInFrames: Math.max(1, Math.round(probe.durationInSeconds * params.fps)),
        },
      };
    }
    case 'audio':
      return {
        asset: { ...base, type: 'audio', durationInSeconds: probe.durationInSeconds },
        item: {
          ...itemBase,
          ...mediaDefaults,
          ...audioDefaults,
          type: 'audio',
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          durationInFrames: Math.max(1, Math.round(probe.durationInSeconds * params.fps)),
        },
      };
    case 'image': {
      const place = placeVisual(probe, params.compW, params.compH, params.dropAt);
      return {
        asset: { ...base, type: 'image', width: probe.width, height: probe.height },
        item: { ...itemBase, ...place, type: 'image', crop: null, durationInFrames: params.fps * 5 },
      };
    }
    case 'gif': {
      const place = placeVisual(probe, params.compW, params.compH, params.dropAt);
      return {
        asset: { ...base, type: 'gif', width: probe.width, height: probe.height, durationInSeconds: probe.durationInSeconds },
        item: {
          ...itemBase,
          ...place,
          ...mediaDefaults,
          type: 'gif',
          durationInFrames: Math.max(1, Math.round(probe.durationInSeconds * params.fps)),
        },
      };
    }
  }
};

const uploadAsset = async (assetId: string, file: File): Promise<void> => {
  const store = useEditorStore.getState();
  store.setAssetStatus(assetId, 'in-progress');
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }),
    });
    if (!res.ok) throw new Error(`upload sign failed: ${res.status}`);
    const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
    if (!put.ok) throw new Error(`upload PUT failed: ${put.status}`);
    // 远端地址写回 asset（可撤销代价可接受）
    useEditorStore.getState().updateUndoable((s) => {
      const asset = s.assets[assetId];
      if (!asset) return s;
      return { ...s, assets: { ...s.assets, [assetId]: { ...asset, url: publicUrl } } };
    });
    useEditorStore.getState().setAssetStatus(assetId, 'uploaded');
  } catch (err) {
    console.error('asset upload failed', err);
    toast.error(`上传失败：${file.name}`);
    useEditorStore.getState().setAssetStatus(assetId, 'error');
  }
};

export const importFiles = async (
  files: File[],
  dropAt?: { x: number; y: number },
  /** 时间轴落点：指定帧 + 悬停轨道；多文件从该帧起依次排布 */
  placement?: { frame: number; trackId?: string },
): Promise<void> => {
  let nextFrame = placement ? Math.max(0, Math.round(placement.frame)) : null;
  for (const file of files) {
    if (file.size > MAX_FILE_UPLOAD_SIZE_IN_MB * 1024 * 1024) {
      console.error(`文件过大: ${file.name}`);
      toast.error(`文件过大：${file.name}（上限 ${MAX_FILE_UPLOAD_SIZE_IN_MB}MB）`);
      continue;
    }
    try {
      const probe = await probeFile(file);
      const blobUrl = URL.createObjectURL(file);
      const store = useEditorStore.getState();
      const frame = nextFrame ?? playerRef.current?.getCurrentFrame() ?? 0;
      let created: { asset: EditorStarterAsset; item: EditorStarterItem } | null = null;
      store.updateUndoable((s) => {
        // 先构建 item（时长在此确定），再定轨道：
        // 悬停轨道放得下就放，否则新建顶部轨道（官方拖放建层行为）
        const built = buildAssetAndItem(probe, file, blobUrl, {
          trackId: '',
          from: frame,
          fps: s.fps,
          compW: s.compositionWidth,
          compH: s.compositionHeight,
          dropAt,
        });
        let st = s;
        let trackId = placement?.trackId;
        if (
          !trackId ||
          !st.tracks.some((t) => t.id === trackId) ||
          hasOverlap(st, trackId, frame, built.item.durationInFrames, [])
        ) {
          const added = addTrack(st, 0);
          st = added.state;
          trackId = added.trackId;
        }
        built.item.trackId = trackId;
        created = built;
        return {
          ...st,
          assets: { ...st.assets, [built.asset.id]: built.asset },
          items: { ...st.items, [built.item.id]: built.item },
        };
      });
      if (!created) continue;
      const { asset, item } = created as { asset: EditorStarterAsset; item: EditorStarterItem };
      if (nextFrame !== null) nextFrame = frame + item.durationInFrames;
      store.setLocalUrl(asset.id, blobUrl);
      store.setAssetStatus(asset.id, 'pending-upload');
      store.setSelected([item.id]);
      void cacheAsset(asset.id, file).catch(() => {});
      void uploadAsset(asset.id, file);
    } catch (err) {
      console.error(`导入失败: ${file.name}`, err);
      toast.error(`导入失败：${file.name}`);
    }
  }
};
