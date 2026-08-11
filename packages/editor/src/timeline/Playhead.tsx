import type React from 'react'
import { useEffect, useRef } from 'react'
import { useEditorRefs } from '#state/context'

/**
 * 播放头：位置不走 React state——直接订阅 frameupdate 改 style.left，
 * 播放期间零 React 重渲（性能关键路径）。
 */
export const Playhead: React.FC<{ zoom: number, onSeek: (frame: number) => void }> = ({
  zoom,
  onSeek,
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const refs = useEditorRefs()

  // zoom 变化时重挂订阅并立即重定位（seek 也走 frameupdate，无需额外处理）
  useEffect(() => {
    const el = ref.current
    if (!el)
      return
    el.style.left = `${refs.getPlayerFrame() * zoom}px`
    const p = refs.player.current
    if (!p)
      return
    const onFrame = (e: { detail: { frame: number } }): void => {
      el.style.left = `${e.detail.frame * zoom}px`
    }
    p.addEventListener('frameupdate', onFrame)
    return () => p.removeEventListener('frameupdate', onFrame)
  }, [refs, zoom])

  return (
    <div
      ref={ref}
      className="absolute inset-y-0 z-20 -ms-1 cursor-ew-resize inline-2"
      style={{ left: refs.getPlayerFrame() * zoom }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        e.stopPropagation()
      }}
      onPointerMove={(e) => {
        if (e.buttons !== 1)
          return
        const parent = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
        onSeek(Math.max(0, Math.round((e.clientX - parent.left) / zoom)))
      }}
    >
      {/* 官方样式：蓝色竖线 + 标尺区内的蓝色小把手 */}
      <div className="mx-auto bg-[#0B84F3] block-full inline-px" />
      <div className="
        absolute inset-s-1/2 inset-bs-[5px] -translate-x-1/2 rounded-[2px]
        bg-[#0B84F3] block-[14px] inline-[7px]
      "
      />
    </div>
  )
}
