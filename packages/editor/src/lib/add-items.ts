import type { EditorStoreApi } from '../state/store'
import { createCaptionAsset, createCaptionsItem, createSolidItem, createTextItem } from '@gedatou/shared'
import { addTrack } from '../timeline/ops'

/** 用 2D canvas 量测单行文本宽度（拿不到 context 时按字号粗估） */
function measureTextWidth(text: string, font: { fontStyle: string, fontWeight: string, fontSize: number, fontFamily: string }): number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx)
    return text.length * font.fontSize
  ctx.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`
  return ctx.measureText(text).width
}

/** 文本工具：在点击点放置自适应尺寸的文本（内容「文本」、字号 80），选中但不进入行内编辑 */
export function addTextItem(store: EditorStoreApi, at: { x: number, y: number }, atFrame: number, text = '文本'): void {
  const state = store.getState()
  const from = atFrame
  let id = ''
  state.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0)
    const item = createTextItem({ trackId, from, text })
    // 盒子自适应文字内容
    item.width = Math.max(
      20,
      Math.ceil(measureTextWidth(item.text, item) + item.letterSpacing * item.text.length),
    )
    item.height = Math.ceil(item.fontSize * item.lineHeight)
    item.left = Math.round(at.x - item.width / 2)
    item.top = Math.round(at.y - item.height / 2)
    id = item.id
    return { ...st, items: { ...st.items, [item.id]: item } }
  })
  state.setSelected([id])
}

/**
 * 手动建字幕块：在播放头处放一个带占位词的字幕，之后在检查器逐词区增删行或导入 SRT/VTT。
 * whisper 之外的第二条创建路径 —— 没有音轨、或转录不可用时也能做字幕。
 */
export function addCaptionsItem(store: EditorStoreApi, atFrame: number): void {
  const state = store.getState()
  let id = ''
  state.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0)
    const asset = createCaptionAsset({
      captions: [{ text: '字幕', startMs: 0, endMs: 1000, timestampMs: 0, confidence: null }],
    })
    const item = createCaptionsItem({
      trackId,
      assetId: asset.id,
      from: atFrame,
      compositionWidth: s.compositionWidth,
      compositionHeight: s.compositionHeight,
    })
    id = item.id
    return {
      ...st,
      assets: { ...st.assets, [asset.id]: asset },
      items: { ...st.items, [item.id]: item },
    }
  })
  state.setSelected([id])
}

/** 画布绘制工具：按给定矩形加色块（官方默认白色） */
export function addSolidItem(store: EditorStoreApi, rect: {
  left: number
  top: number
  width: number
  height: number
}, atFrame: number): void {
  const state = store.getState()
  const from = atFrame
  let id = ''
  state.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0)
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const item = createSolidItem({ trackId, from, width, height })
    item.color = '#ffffff'
    item.left = Math.round(rect.left)
    item.top = Math.round(rect.top)
    id = item.id
    return { ...st, items: { ...st.items, [item.id]: item } }
  })
  state.setSelected([id])
}
