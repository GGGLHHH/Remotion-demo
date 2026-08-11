import type React from 'react'
import { useMemo } from 'react'
import { RULER_HEIGHT } from './constants'

export function formatTime(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 时间刻度：按缩放选步长，保证刻度间距 >= 60px */
export const Ruler: React.FC<{
  durationInFrames: number
  fps: number
  zoom: number
  onSeek: (frame: number) => void
}> = ({ durationInFrames, fps, zoom, onSeek }) => {
  const ticks = useMemo(() => {
    const stepSeconds = Math.max(1, Math.ceil(60 / (fps * zoom)))
    const stepFrames = stepSeconds * fps
    const result: { frame: number, label: string }[] = []
    for (let f = 0; f <= durationInFrames + stepFrames; f += stepFrames) {
      result.push({ frame: f, label: formatTime(f, fps) })
    }
    return result
  }, [durationInFrames, fps, zoom])

  const seekFromEvent = (e: React.PointerEvent): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frame = Math.max(0, Math.round((e.clientX - rect.left) / zoom))
    onSeek(Math.min(frame, durationInFrames - 1))
  }

  return (
    <div
      data-ruler
      className="
        relative cursor-pointer overflow-hidden border-be border-border
        text-[10px] text-muted-foreground select-none
      "
      style={{ height: RULER_HEIGHT }}
      onPointerDown={(e) => {
        if (e.button !== 0)
          return
        // 阻止冒泡到时间线背景（否则框选逻辑会抢走指针捕获，无法按住连续 scrub）
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFromEvent(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1)
          seekFromEvent(e)
      }}
    >
      {ticks.map(t => (
        <div key={t.frame} className="absolute inset-bs-0 block-full" style={{ left: t.frame * zoom }}>
          <div className="bg-muted-foreground block-1.5 inline-px" />
          <span className="ps-1">{t.label}</span>
        </div>
      ))}
    </div>
  )
}
