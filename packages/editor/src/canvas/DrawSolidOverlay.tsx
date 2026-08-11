import type React from 'react'
import type { Rect } from './geometry'
import { useRef, useState } from 'react'
import { addSolidItem } from '../lib/add-items'
import { useEditorApi, useEditorRefs } from '../state/context'
import { CORNERS, SizeBadge } from './handle-primitives'

/** 无明显拖拽（<5px）视为单击 */
const CLICK_THRESHOLD_PX = 5
/** 单击创建的默认色块尺寸（官方 100×100） */
const CLICK_SIZE = 100

/** 绘制色块模式：拖拽中实时渲染真实色块（白色）+ 选中样式 + 尺寸徽章；单击创建 100×100 */
export const DrawSolidOverlay: React.FC<{ scale: number, onDone: () => void }> = ({
  scale,
  onDone,
}) => {
  const editorApi = useEditorApi()
  const refs = useEditorRefs()
  const startRef = useRef<{ x: number, y: number, clientX: number, clientY: number } | null>(null)
  const [preview, setPreview] = useState<Rect | null>(null)

  const toComp = (e: React.PointerEvent): { x: number, y: number } => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  const dragRect = (e: React.PointerEvent, s: { x: number, y: number }): Rect => {
    const { x, y } = toComp(e)
    return {
      left: Math.min(s.x, x),
      top: Math.min(s.y, y),
      width: Math.abs(x - s.x),
      height: Math.abs(y - s.y),
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 cursor-crosshair"
      onPointerDown={(e) => {
        if (e.button !== 0)
          return
        const { x, y } = toComp(e)
        startRef.current = { x, y, clientX: e.clientX, clientY: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (startRef.current)
          setPreview(dragRect(e, startRef.current))
      }}
      onPointerUp={(e) => {
        const s = startRef.current
        startRef.current = null
        setPreview(null)
        if (!s)
          return
        const dragged
          = Math.hypot(e.clientX - s.clientX, e.clientY - s.clientY) >= CLICK_THRESHOLD_PX
        if (dragged) {
          addSolidItem(editorApi, dragRect(e, s), refs.getPlayerFrame())
        }
        else {
          // 单击：100×100，以点击点为中心
          addSolidItem(
            editorApi,
            {
              left: s.x - CLICK_SIZE / 2,
              top: s.y - CLICK_SIZE / 2,
              width: CLICK_SIZE,
              height: CLICK_SIZE,
            },
            refs.getPlayerFrame(),
          )
        }
        onDone()
      }}
      onPointerCancel={() => {
        startRef.current = null
        setPreview(null)
      }}
    >
      {preview
        ? (
      // 实时渲染真实色块（白色）+ 选中样式（蓝框 + 角手柄）+ 尺寸徽章
            <div
              className="
                pointer-events-none absolute border-2 border-blue-500 bg-white
              "
              style={{
                left: preview.left * scale,
                top: preview.top * scale,
                width: preview.width * scale,
                height: preview.height * scale,
              }}
            >
              {CORNERS.map(({ handle, x, y }) => (
                <div
                  key={handle}
                  className="
                    absolute border border-[#0B84F3] bg-white block-2 inline-2
                  "
                  style={{ left: `calc(${x * 100}% - 4px)`, top: `calc(${y * 100}% - 4px)` }}
                />
              ))}
              <SizeBadge width={preview.width} height={preview.height} />
            </div>
          )
        : null}
    </div>
  )
}
