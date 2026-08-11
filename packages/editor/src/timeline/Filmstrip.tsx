import type React from 'react'
import { ALL_FORMATS, BlobSource, CanvasSink, Input, UrlSource } from 'mediabunny'
import { useEffect, useState } from 'react'

const THUMB_W = 48
const THUMB_H = 44
/** 每素材最多生成的缩略帧数（超长素材加大每格秒数） */
const MAX_THUMBS = 60

/**
 * 时间锚定（官方行为）：缩略图按素材时间固定生成一次（key 只含 assetId+url），
 * 修剪/缩放只改 CSS 平移与格宽，永不重新解码 —— 拖边界不会触发重新渲染。
 */
interface StripEntry {
  thumbs: (string | null)[]
  /** 每格覆盖的素材秒数 */
  secondsPerThumb: number
  done: boolean
  listeners: Set<() => void>
}

/** key 含 url：远程失败的条目不会挡住随后恢复的 blob URL 重试 */
const cache = new Map<string, StripEntry>()

function drawToDataUrl(source: CanvasImageSource): string {
  const tmp = document.createElement('canvas')
  tmp.width = THUMB_W
  tmp.height = THUMB_H
  tmp.getContext('2d')!.drawImage(source, 0, 0)
  return tmp.toDataURL('image/jpeg', 0.6)
}

/** 回退路径：<video> 逐次 seek 抽帧（WebCodecs 不支持的编码），同样逐帧通知 */
async function generateViaVideoElement(entry: StripEntry, url: string): Promise<void> {
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  // 远程素材（MinIO）需带 CORS 凭据加载，否则 canvas 被污染、toDataURL 抛 SecurityError
  video.crossOrigin = 'anonymous'
  video.src = url
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('video load failed'))
  })
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_W
  canvas.height = THUMB_H
  const ctx = canvas.getContext('2d')!
  for (let i = 0; i < entry.thumbs.length; i++) {
    const t = (i + 0.5) * entry.secondsPerThumb
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve()
      video.currentTime = Math.min(t, Math.max(0, video.duration - 0.05))
    })
    const scale = Math.max(THUMB_W / video.videoWidth, THUMB_H / video.videoHeight)
    const w = video.videoWidth * scale
    const h = video.videoHeight * scale
    ctx.clearRect(0, 0, THUMB_W, THUMB_H)
    ctx.drawImage(video, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h)
    entry.thumbs[i] = canvas.toDataURL('image/jpeg', 0.6)
    entry.listeners.forEach(l => l())
  }
  video.src = ''
}

/** 主路径：mediabunny CanvasSink（WebCodecs 硬解，官方同款），逐帧产出立即显示 */
async function generateInto(entry: StripEntry, url: string): Promise<void> {
  const notify = (): void => entry.listeners.forEach(l => l())
  let input: Input | null = null
  try {
    const source = url.startsWith('blob:')
      ? new BlobSource(await (await fetch(url)).blob())
      : new UrlSource(url)
    input = new Input({ formats: ALL_FORMATS, source })
    const track = await input.getPrimaryVideoTrack()
    if (!track)
      return
    const sink = new CanvasSink(track, { width: THUMB_W, height: THUMB_H, fit: 'cover' })
    const timestamps = entry.thumbs.map((_, i) => (i + 0.5) * entry.secondsPerThumb)
    let i = 0
    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      if (wrapped) {
        entry.thumbs[i] = drawToDataUrl(wrapped.canvas)
        notify()
      }
      i++
    }
  }
  catch {
    await generateViaVideoElement(entry, url).catch(() => undefined)
  }
  finally {
    entry.done = true
    void input?.dispose()
    notify()
  }
}

export const Filmstrip: React.FC<{
  assetId: string
  url: string
  widthPx: number
  /** 素材总时长（秒） */
  assetDurationSec: number
  /** 块起点对应的素材偏移（秒，= trimBefore/fps） */
  trimBeforeSec: number
  /** 块覆盖的素材时长（秒，= durationInFrames×playbackRate/fps） */
  visibleSec: number
}> = ({ assetId, url, widthPx, assetDurationSec, trimBeforeSec, visibleSec }) => {
  const key = `${assetId}:${url}`
  // 缩略图逐帧解码进模块级 cache(原地改 thumbs 数组),这里只需要「有新帧了,重画一次」。
  // 计数器本身没人读,故意只取 setter。
  // eslint-disable-next-line react/use-state
  const [, force] = useState(0)

  useEffect(() => {
    let entry = cache.get(key)
    if (!entry) {
      const secondsPerThumb = Math.max(1, assetDurationSec / MAX_THUMBS)
      const count = Math.max(1, Math.min(MAX_THUMBS, Math.ceil(assetDurationSec / secondsPerThumb)))
      entry = {
        thumbs: Array.from<string | null>({ length: count }).fill(null),
        secondsPerThumb,
        done: false,
        listeners: new Set(),
      }
      cache.set(key, entry)
      void generateInto(entry, url)
    }
    // 订阅的是模块级 cache 的解码进度(原地改 thumbs),这个 setter 就是「重画一次」的信号
    // eslint-disable-next-line react/set-state-in-effect
    const listener = (): void => force(n => n + 1)
    entry.listeners.add(listener)
    // 挂载时补一次:这条素材的缩略图可能早已解码好躺在 cache 里,不补就要等下一帧事件才显示
    listener()
    return () => {
      entry.listeners.delete(listener)
    }
  }, [key, url, assetDurationSec])

  const entry = cache.get(key)
  if (!entry || visibleSec <= 0)
    return null
  const pxPerSec = widthPx / visibleSec
  const slotW = entry.secondsPerThumb * pxPerSec
  return (
    <div className="
      pointer-events-none absolute inset-0 overflow-hidden opacity-70
    "
    >
      {/* 第 i 格就是「素材第 i 段时间」,格数与顺序在解码前就定死,index 正是它的身份 */}
      {/* eslint-disable react/no-array-index-key */}
      {entry.thumbs.map((t, i) => {
        if (!(t != null && t !== ''))
          return null
        // 第 i 格覆盖素材 [i·spt, (i+1)·spt) 秒 → 块内像素位置（时间锚定，修剪仅平移）
        const left = (i * entry.secondsPerThumb - trimBeforeSec) * pxPerSec
        if (left + slotW < 0 || left > widthPx)
          return null
        return (
          <div
            key={i}
            className="absolute inset-y-0"
            style={{ left, width: slotW, backgroundImage: `url(${t})`, backgroundSize: 'cover' }}
          />
        )
      })}
      {/* eslint-enable react/no-array-index-key */}
    </div>
  )
}
