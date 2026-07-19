import {
  MAX_FILE_UPLOAD_SIZE_IN_MB,
  newId,
  type EditorStarterAsset,
  type EditorStarterItem,
} from '@gedatou/shared';
import type { EditorStoreApi } from '../state/store';
import type { EditorDeps } from '../state/runtime';
import { addTrack, hasOverlap } from '../timeline/ops';
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

const uploadAsset = async (
  store: EditorStoreApi,
  deps: EditorDeps,
  assetId: string,
  file: File,
): Promise<void> => {
  store.getState().setAssetStatus(assetId, 'in-progress');
  try {
    const { url } = await deps.transport.uploadAsset(file, {
      onProgress: (pct) => store.getState().setUploadProgress(assetId, pct),
    });
    // 远端地址写回 asset（可撤销代价可接受）
    store.getState().updateUndoable((s) => {
      const asset = s.assets[assetId];
      if (!asset) return s;
      return { ...s, assets: { ...s.assets, [assetId]: { ...asset, url } } };
    });
    store.getState().setAssetStatus(assetId, 'uploaded');
    store.getState().setUploadProgress(assetId, null);
  } catch (err) {
    console.error('asset upload failed', err);
    deps.notify(`上传失败：${file.name}`, 'error');
    store.getState().setAssetStatus(assetId, 'error');
    store.getState().setUploadProgress(assetId, null);
  }
};

export const importFiles = async (
  store: EditorStoreApi,
  deps: EditorDeps,
  files: File[],
  dropAt?: { x: number; y: number },
  /** 时间轴落点：指定帧 + 悬停轨道；多文件从该帧起依次排布 */
  placement?: { frame: number; trackId?: string },
  /** 默认落点帧（无显式 placement 时用，通常传当前播放头帧） */
  currentFrame = 0,
): Promise<void> => {
  let nextFrame = placement ? Math.max(0, Math.round(placement.frame)) : null;
  for (const file of files) {
    if (file.size > MAX_FILE_UPLOAD_SIZE_IN_MB * 1024 * 1024) {
      console.error(`文件过大: ${file.name}`);
      deps.notify(`文件过大：${file.name}（上限 ${MAX_FILE_UPLOAD_SIZE_IN_MB}MB）`, 'error');
      continue;
    }
    try {
      const probe = await probeFile(file);
      const blobUrl = URL.createObjectURL(file);
      const state = store.getState();
      const frame = nextFrame ?? currentFrame;
      let created: { asset: EditorStarterAsset; item: EditorStarterItem } | null = null;
      state.updateUndoable((s) => {
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
      state.setLocalUrl(asset.id, blobUrl);
      state.setAssetStatus(asset.id, 'pending-upload');
      state.setSelected([item.id]);
      void deps.storage.putAsset(asset.id, file).catch(() => {});
      void uploadAsset(store, deps, asset.id, file);
    } catch (err) {
      console.error(`导入失败: ${file.name}`, err);
      deps.notify(`导入失败：${file.name}`, 'error');
    }
  }
};
