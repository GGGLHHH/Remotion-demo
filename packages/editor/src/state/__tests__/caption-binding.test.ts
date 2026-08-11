import type { EditorStoreApi } from '../store'
import {
  createCaptionAsset,
  createCaptionsItem,
  createEmptyState,
  createSolidItem,
  createTrack,
  DEFAULT_COMPOSITION_HEIGHT,
  DEFAULT_COMPOSITION_WIDTH,
} from '@gedatou/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { createEditorStore } from '../store'

// 字幕与源块的绑定(sourceItemId):源块删除时字幕跟着删。
// 移动跟随那半边住在 use-move-drag 的拖拽状态机里，只能端到端验，这里覆盖删除这条。

function buildState() {
  const s = createEmptyState({ width: DEFAULT_COMPOSITION_WIDTH, height: DEFAULT_COMPOSITION_HEIGHT })
  const track = createTrack('T0')
  s.tracks.push(track)
  // 拿 solid 冒充源素材：删除逻辑只看 sourceItemId 指向谁，不关心源是什么类型
  const src = createSolidItem({ trackId: track.id, from: 0, width: 100, height: 100 })
  const other = createSolidItem({ trackId: track.id, from: 300, width: 100, height: 100 })
  s.items[src.id] = src
  s.items[other.id] = other

  const asset = createCaptionAsset({ captions: [{ text: 'hi', startMs: 0, endMs: 1000, timestampMs: 0, confidence: null }] })
  s.assets[asset.id] = asset
  const bound = createCaptionsItem({
    trackId: track.id,
    from: 0,
    assetId: asset.id,
    sourceItemId: src.id,
    compositionWidth: s.compositionWidth,
    compositionHeight: s.compositionHeight,
  })
  s.items[bound.id] = bound

  const freeAsset = createCaptionAsset({ captions: [] })
  s.assets[freeAsset.id] = freeAsset
  // 手动建的字幕：没有 sourceItemId，谁也不跟
  const free = createCaptionsItem({
    trackId: track.id,
    from: 500,
    assetId: freeAsset.id,
    compositionWidth: s.compositionWidth,
    compositionHeight: s.compositionHeight,
  })
  s.items[free.id] = free

  return { s, srcId: src.id, otherId: other.id, boundId: bound.id, freeId: free.id }
}

let api: EditorStoreApi
let built: ReturnType<typeof buildState>

beforeEach(() => {
  api = createEditorStore()
  built = buildState()
  api.setState({ undoable: built.s })
})

describe('字幕绑定源块', () => {
  it('工厂只在给了 sourceItemId 时写这个字段', () => {
    const items = api.getState().undoable.items
    expect(items[built.boundId]).toMatchObject({ sourceItemId: built.srcId })
    expect(items[built.freeId]).not.toHaveProperty('sourceItemId')
  })

  it('删源块 ⇒ 绑定它的字幕一起删', () => {
    api.getState().setSelected([built.srcId])
    api.getState().deleteSelected()
    const items = api.getState().undoable.items
    expect(items[built.srcId]).toBeUndefined()
    expect(items[built.boundId]).toBeUndefined()
  })

  it('删无关块 ⇒ 字幕不受影响', () => {
    api.getState().setSelected([built.otherId])
    api.getState().deleteSelected()
    const items = api.getState().undoable.items
    expect(items[built.boundId]).toBeDefined()
    expect(items[built.freeId]).toBeDefined()
  })

  it('没绑定的字幕不跟任何删除走', () => {
    api.getState().setSelected([built.srcId])
    api.getState().deleteSelected()
    expect(api.getState().undoable.items[built.freeId]).toBeDefined()
  })

  it('连带删除与删除同属一步撤销', () => {
    api.getState().setSelected([built.srcId])
    api.getState().deleteSelected()
    api.getState().undo()
    const items = api.getState().undoable.items
    expect(items[built.srcId]).toBeDefined()
    expect(items[built.boundId]).toBeDefined()
  })

  it('字幕的素材在连带删除后进入两阶段删除名单', () => {
    const bound = api.getState().undoable.items[built.boundId]
    const assetId = bound!.type === 'captions' ? bound!.assetId : ''
    api.getState().setSelected([built.srcId])
    api.getState().deleteSelected()
    expect(api.getState().undoable.deletedAssets.map(d => d.assetId)).toContain(assetId)
  })
})
