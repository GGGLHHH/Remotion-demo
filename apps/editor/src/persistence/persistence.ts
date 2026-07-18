import type { UndoableState } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { getCachedAsset } from '../caching/indexeddb';

const STORAGE_KEY = 'remotion-editor-state-v1';

export const serializeState = (state: UndoableState): string => JSON.stringify(state);

export const deserializeState = (raw: string): UndoableState | null => {
  try {
    const parsed = JSON.parse(raw) as UndoableState;
    if (!parsed || !Array.isArray(parsed.tracks) || typeof parsed.items !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveState = (): void => {
  const { undoable } = useEditorStore.getState();
  localStorage.setItem(STORAGE_KEY, serializeState(undoable));
  useEditorStore.setState({ lastSavedState: undoable });
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

export const downloadStateFile = (): void => {
  const { undoable } = useEditorStore.getState();
  const blob = new Blob([serializeState(undoable)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `editor-project-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const loadStateFromFile = async (file: File): Promise<boolean> => {
  const state = deserializeState(await file.text());
  if (!state) return false;
  useEditorStore.setState({ undoable: state, past: [], future: [], selectedItemIds: [] });
  void restoreLocalUrls(state);
  return true;
};

/** 从 IndexedDB 恢复本地缓存 blob URL，并推断上传状态 */
export const restoreLocalUrls = async (state: UndoableState): Promise<void> => {
  const store = useEditorStore.getState();
  for (const asset of Object.values(state.assets)) {
    if (asset.url.startsWith('http')) store.setAssetStatus(asset.id, 'uploaded');
    const blob = await getCachedAsset(asset.id).catch(() => null);
    if (blob) store.setLocalUrl(asset.id, URL.createObjectURL(blob));
  }
};

/** 启动状态：URL hash > localStorage > null */
export const resolveInitialState = (): UndoableState | null =>
  loadStateFromUrlHash() ?? loadSavedState();
