import { toast } from 'sonner';
import type { EditorStarterItem, UndoableState } from '@gedatou/shared';
import type { EditorStoreApi } from '../state/store';
import { getCachedAsset } from '../caching/indexeddb';

const STORAGE_KEY = 'remotion-editor-state-v1';

/** 旧数据迁移：视频缺 audioFade* 时继承视觉淡变（旧模型单对同时驱动画面与音量），原地修改 */
export const normalizeLegacyFades = (items: Iterable<EditorStarterItem>): void => {
  for (const item of items) {
    if (item && item.type === 'video') {
      item.audioFadeInDurationInFrames ??= item.fadeInDurationInFrames;
      item.audioFadeOutDurationInFrames ??= item.fadeOutDurationInFrames;
    }
  }
};

export const serializeState = (state: UndoableState): string => JSON.stringify(state);

export const deserializeState = (raw: string): UndoableState | null => {
  try {
    const parsed = JSON.parse(raw) as UndoableState;
    if (!parsed || !Array.isArray(parsed.tracks) || typeof parsed.items !== 'object') return null;
    normalizeLegacyFades(Object.values(parsed.items));
    return parsed;
  } catch {
    return null;
  }
};

export const saveState = (store: EditorStoreApi): void => {
  const { undoable } = store.getState();
  localStorage.setItem(STORAGE_KEY, serializeState(undoable));
  store.setState({ lastSavedState: undoable });
  toast.success('已保存');
};

export const loadSavedState = (): UndoableState | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? deserializeState(raw) : null;
};

export const loadStateFromUrlHash = (): UndoableState | null => {
  const match = window.location.hash.match(/#state=(.+)/);
  if (!match) return null;
  try {
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(decodeURIComponent(match[1])), (c) => c.charCodeAt(0)),
    );
    return deserializeState(json);
  } catch {
    return null;
  }
};

export const downloadStateFile = (store: EditorStoreApi): void => {
  const { undoable } = store.getState();
  const blob = new Blob([serializeState(undoable)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `editor-project-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const loadStateFromFile = async (store: EditorStoreApi, file: File): Promise<boolean> => {
  const state = deserializeState(await file.text());
  if (!state) {
    toast.error('工程文件无效，无法恢复');
    return false;
  }
  store.setState({ undoable: state, past: [], future: [], selectedItemIds: [] });
  void restoreLocalUrls(store, state);
  return true;
};

/** 从 IndexedDB 恢复本地缓存 blob URL，并推断上传状态 */
export const restoreLocalUrls = async (
  store: EditorStoreApi,
  state: UndoableState,
): Promise<void> => {
  const s = store.getState();
  for (const asset of Object.values(state.assets)) {
    if (asset.url.startsWith('http')) s.setAssetStatus(asset.id, 'uploaded');
    const blob = await getCachedAsset(asset.id).catch(() => null);
    if (blob) s.setLocalUrl(asset.id, URL.createObjectURL(blob));
  }
};

/** 启动状态：URL hash > localStorage > null */
export const resolveInitialState = (): UndoableState | null =>
  loadStateFromUrlHash() ?? loadSavedState();
