import type { UndoableState } from '@gedatou/shared';
import type { EditorStorage } from '../../state/runtime';
import { cacheAsset, deleteCachedAsset, getCachedAsset } from '../../caching/indexeddb';
import { deserializeState, serializeState } from '../../persistence/persistence';

const STORAGE_KEY = 'remotion-editor-state-v1';

const loadStateFromUrlHash = (): UndoableState | null => {
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

const loadSavedState = (): UndoableState | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? deserializeState(raw) : null;
};

/** 默认 storage：localStorage + URL hash 载入，IndexedDB 素材缓存。仅 demo 用。 */
export function createBrowserStorage(): EditorStorage {
  return {
    // 启动状态：URL hash > localStorage
    loadProject: () => loadStateFromUrlHash() ?? loadSavedState(),
    saveProject: (state) => localStorage.setItem(STORAGE_KEY, serializeState(state)),
    getAsset: getCachedAsset,
    putAsset: cacheAsset,
    deleteAsset: deleteCachedAsset,
  };
}
