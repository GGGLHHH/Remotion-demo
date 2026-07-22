import type { EditorStarterItem, UndoableState } from '@gedatou/shared';
import type { EditorStoreApi } from '../state/store';
import type { EditorDeps } from '../state/runtime';
import { tFor } from '../lib/i18n';

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
    parsed.transitions ??= {};
    return parsed;
  } catch {
    return null;
  }
};

export const saveState = (store: EditorStoreApi, deps: EditorDeps): void => {
  const { undoable } = store.getState();
  deps.storage.saveProject(undoable);
  store.setState({ lastSavedState: undoable });
  deps.notify(tFor(deps)('persistence.saved'), 'success');
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

export const loadStateFromFile = async (
  store: EditorStoreApi,
  deps: EditorDeps,
  file: File,
): Promise<boolean> => {
  const state = deserializeState(await file.text());
  if (!state) {
    deps.notify(tFor(deps)('persistence.invalidProjectFile'), 'error');
    return false;
  }
  store.setState({ undoable: state, past: [], future: [], selectedItemIds: [] });
  void restoreLocalUrls(store, deps, state);
  return true;
};

/** 从本地缓存恢复 blob URL，并推断上传状态 */
export const restoreLocalUrls = async (
  store: EditorStoreApi,
  deps: EditorDeps,
  state: UndoableState,
): Promise<void> => {
  const s = store.getState();
  for (const asset of Object.values(state.assets)) {
    if (asset.url.startsWith('http')) s.setAssetStatus(asset.id, 'uploaded');
    const blob = await deps.storage.getAsset(asset.id).catch(() => null);
    if (blob) s.setLocalUrl(asset.id, URL.createObjectURL(blob));
  }
};
