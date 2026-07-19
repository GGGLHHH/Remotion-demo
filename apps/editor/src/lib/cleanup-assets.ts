import type { EditorStoreApi } from '../state/store';
import { deleteCachedAsset } from '../caching/indexeddb';

/**
 * 真正删除两阶段删除的素材（远端对象 + IndexedDB 缓存 + blob URL）。
 * 撤销栈里的快照可能仍引用这些素材，官方做法：先清栈，因此本操作不可撤销，
 * 直接 setState 而不走 updateUndoable。
 */
export const cleanupDeletedAssets = async (store: EditorStoreApi): Promise<void> => {
  store.setState({ past: [], future: [] });
  const { undoable, localUrls } = store.getState();
  const referenced = new Set(
    Object.values(undoable.items).map((i) => ('assetId' in i ? i.assetId : null)),
  );
  const removed: string[] = [];
  for (const { assetId } of undoable.deletedAssets) {
    if (referenced.has(assetId)) continue;
    const asset = undoable.assets[assetId];
    if (asset?.url.startsWith('http')) {
      // URL 形如 <publicBaseUrl>/<bucket>/assets/xxx，bucket 之后即对象 key
      const key = new URL(asset.url).pathname.split('/').slice(2).join('/');
      await fetch('/api/delete-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }).catch(() => null);
    }
    await deleteCachedAsset(assetId).catch(() => null);
    if (localUrls[assetId]) URL.revokeObjectURL(localUrls[assetId]);
    removed.push(assetId);
  }
  store.setState((s) => {
    const assets = { ...s.undoable.assets };
    for (const id of removed) delete assets[id];
    return {
      undoable: { ...s.undoable, assets, deletedAssets: [] },
      past: [],
      future: [],
    };
  });
};
