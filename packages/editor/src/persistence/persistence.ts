import type { EditorStarterItem, UndoableState } from '@gedatou/shared'
import type { EditorDeps } from '#state/runtime'
import type { EditorStoreApi } from '#state/store'
import { dictValues, pruneGroups } from '@gedatou/shared'
import { tFor } from '#lib/i18n-core'

/** 旧数据迁移：视频缺 audioFade* 时继承视觉淡变（旧模型单对同时驱动画面与音量），原地修改 */
export function normalizeLegacyFades(items: Iterable<EditorStarterItem>): void {
  for (const item of items) {
    if (item.type === 'video') {
      item.audioFadeInDurationInFrames ??= item.fadeInDurationInFrames
      item.audioFadeOutDurationInFrames ??= item.fadeOutDurationInFrames
    }
  }
}

export const serializeState = (state: UndoableState): string => JSON.stringify(state)

export function deserializeState(raw: string): UndoableState | null {
  try {
    // 存档是外部输入(用户可能导入任意文件),先按 Partial 过校验,过了才认作 UndoableState
    const parsed = JSON.parse(raw) as Partial<UndoableState> | null
    if (!parsed || !Array.isArray(parsed.tracks) || typeof parsed.items !== 'object')
      return null
    const state = parsed as UndoableState
    normalizeLegacyFades(dictValues(state.items))
    state.transitions ??= {}
    // 组自愈:清掉指向已不存在 item 的成员、解散降到 <2 的组(覆盖 deleteSelected 之外的移除路径)
    state.groups = pruneGroups(state.groups ?? {}, new Set(Object.keys(state.items)))
    return state
  }
  catch {
    return null
  }
}

export function saveState(store: EditorStoreApi, deps: EditorDeps): void {
  const { undoable } = store.getState()
  // 存储是宿主注入的,可能是异步的(IndexedDB/远端)。这里刻意不等:保存提示按乐观语义即时给出,
  // 失败由 adapter 自己上报 —— 把 saveState 改成 async 会传染到所有命令调用点。
  void deps.storage.saveProject(undoable)
  store.setState({ lastSavedState: undoable })
  deps.notify(tFor(deps)('persistence.saved'), 'success')
}

export function downloadStateFile(store: EditorStoreApi): void {
  const { undoable } = store.getState()
  const blob = new Blob([serializeState(undoable)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `editor-project-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function loadStateFromFile(store: EditorStoreApi, deps: EditorDeps, file: File): Promise<boolean> {
  const state = deserializeState(await file.text())
  if (!state) {
    deps.notify(tFor(deps)('persistence.invalidProjectFile'), 'error')
    return false
  }
  store.setState({ undoable: state, past: [], future: [], selectedItemIds: [] })
  void restoreLocalUrls(store, deps, state)
  return true
}

/** 从本地缓存恢复 blob URL，并推断上传状态 */
export async function restoreLocalUrls(store: EditorStoreApi, deps: EditorDeps, state: UndoableState): Promise<void> {
  const s = store.getState()
  for (const asset of dictValues(state.assets)) {
    if (asset.url.startsWith('http'))
      s.setAssetStatus(asset.id, 'uploaded')
    const blob = await deps.storage.getAsset(asset.id).catch(() => null)
    if (blob)
      s.setLocalUrl(asset.id, URL.createObjectURL(blob))
  }
}
