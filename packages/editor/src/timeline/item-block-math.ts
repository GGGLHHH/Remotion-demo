import type { EditorStarterItem } from '@gedatou/shared'

// ItemBlock 的纯数学/换算(无 React 依赖):dB 显示、音量线↔增益映射、淡变对读写、楔形路径。
// 从 ItemBlock.tsx 搬出,便于脱 React 单测,也让组件文件只剩渲染逻辑。

/** 官方格式的 dB 显示:+8.0 dB / 0.0 dB / -∞ dB */
export function formatDb(gain: number): string {
  if (gain <= 0)
    return '-∞ dB'
  const d = 20 * Math.log10(gain)
  return `${d > 0 ? '+' : ''}${d.toFixed(1)} dB`
}

/**
 * 音量线纵向位置(官方实测映射,dB 线性):top% = (20 − dB) / 80,
 * 0dB 在条带 25% 处;顶 = +20dB(10 倍增益);底 = −∞ 静音。
 */
export function gainToTopFraction(gain: number): number {
  return gain <= 0 ? 1 : Math.min(1, Math.max(0, (20 - 20 * Math.log10(gain)) / 80))
}
export function topFractionToGain(f: number): number {
  return f >= 1 ? 0 : 10 ** ((20 - 80 * Math.min(1, Math.max(0, f))) / 20)
}

/**
 * 淡变对(官方实测):视频块有两组手柄——块顶角驱动视觉对(基础字段),
 * 音频条带上缘两角驱动独立的音频对;音频块单组(基础对即其音频淡变)。
 */
export type FadePairKind = 'visual' | 'audio'

export function readFadePair(it: EditorStarterItem, kind: FadePairKind): { fadeIn: number, fadeOut: number } {
  return kind === 'audio' && it.type === 'video'
    ? { fadeIn: it.audioFadeInDurationInFrames ?? 0, fadeOut: it.audioFadeOutDurationInFrames ?? 0 }
    : { fadeIn: it.fadeInDurationInFrames, fadeOut: it.fadeOutDurationInFrames }
}

export function writeFade(it: EditorStarterItem, kind: FadePairKind, side: 'in' | 'out', v: number): EditorStarterItem {
  return kind === 'audio' && it.type === 'video'
    ? side === 'in'
      ? { ...it, audioFadeInDurationInFrames: v }
      : { ...it, audioFadeOutDurationInFrames: v }
    : side === 'in'
      ? { ...it, fadeInDurationInFrames: v }
      : { ...it, fadeOutDurationInFrames: v }
}

/** 等功率淡变楔形路径(官方:黑色 SVG,覆盖未达全音量的区域) */
export function wedgePath(w: number, h: number, side: 'in' | 'out'): string {
  const N = 12
  const pts: string[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const gain = Math.sin((Math.PI / 2) * t) // 等功率曲线
    const x = side === 'in' ? t * w : w - t * w
    pts.push(`L ${x.toFixed(1)} ${(h * (1 - gain)).toFixed(1)}`)
  }
  const x0 = side === 'in' ? 0 : w
  return `M ${x0} 0 L ${x0} ${h} ${pts.join(' ')} Z`
}
