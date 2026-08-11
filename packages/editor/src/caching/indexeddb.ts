const DB_NAME = 'editor-assets'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let dbPromise: Promise<IDBDatabase> | null = null
const db = (): Promise<IDBDatabase> => (dbPromise ??= openDb())

const tx = async (mode: IDBTransactionMode): Promise<IDBObjectStore> => (await db()).transaction(STORE, mode).objectStore(STORE)

export async function cacheAsset(assetId: string, blob: Blob): Promise<void> {
  const store = await tx('readwrite')
  await new Promise<void>((resolve, reject) => {
    const req = store.put(blob, assetId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getCachedAsset(assetId: string): Promise<Blob | null> {
  const store = await tx('readonly')
  return new Promise((resolve, reject) => {
    const req = store.get(assetId)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteCachedAsset(assetId: string): Promise<void> {
  const store = await tx('readwrite')
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(assetId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
