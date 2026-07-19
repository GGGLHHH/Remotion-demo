import { toast } from 'sonner';
import {
  MAX_FILE_UPLOAD_SIZE_IN_MB,
  newId,
  type EditorStarterAsset,
  type EditorStarterItem,
} from '@gedatou/shared';
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

/** XHR PUT：fetch 拿不到上传进度，用 XHR 的 upload.onprogress */
const putWithProgress = (url: string, file: File, contentType: string, onProgress: (pct: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload PUT failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('upload PUT network error'));
    xhr.send(file);
  });

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
    await putWithProgress(uploadUrl, file, file.type || 'application/octet-stream', (pct) =>
      useEditorStore.getState().setUploadProgress(assetId, pct),
    );
    // 远端地址写回 asset（可撤销代价可接受）
    useEditorStore.getState().updateUndoable((s) => {
      const asset = s.assets[assetId];
      if (!asset) return s;
      return { ...s, assets: { ...s.assets, [assetId]: { ...asset, url: publicUrl } } };
    });
    useEditorStore.getState().setAssetStatus(assetId, 'uploaded');
    useEditorStore.getState().setUploadProgress(assetId, null);
  } catch (err) {
    console.error('asset upload failed', err);
    toast.error(`上传失败：${file.name}`);
    useEditorStore.getState().setAssetStatus(assetId, 'error');
    useEditorStore.getState().setUploadProgress(assetId, null);
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
        // - 时间轴拖放：悬停轨道放得下就放，否则新建顶部轨道
        // - 默认（头部按钮/粘贴/画布拖放）：官方行为——落在播放头处有空间的现有轨道，
        //   都放不下才新建顶部轨道
        const built = buildAssetAndItem(probe, file, blobUrl, {
          trackId: '',
          from: frame,
          fps: s.fps,
          compW: s.compositionWidth,
          compH: s.compositionHeight,
          dropAt,
        });
        let st = s;
        const dur = built.item.durationInFrames;
        let trackId = placement?.trackId;
        if (!trackId || !st.tracks.some((t) => t.id === trackId) || hasOverlap(st, trackId, frame, dur, [])) {
          trackId = placement?.trackId
            ? undefined // 显式落点放不下 ⇒ 直接新建（保持拖放行为）
            : st.tracks.find((t) => !hasOverlap(st, t.id, frame, dur, []))?.id;
        }
        if (!trackId) {
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
