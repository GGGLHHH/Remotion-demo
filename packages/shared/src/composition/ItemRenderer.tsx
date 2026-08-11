import type React from 'react'
import type { EditorStarterItem, UndoableState } from '../types'
import { interpolate, Sequence, useCurrentFrame } from 'remotion'
import { getCustomItemRenderer } from '../custom-items'
import { CaptionsItemRenderer } from './items/CaptionsItemRenderer'
import {
  AudioItemRenderer,
  GifItemRenderer,
  ImageItemRenderer,
  VideoItemRenderer,
} from './items/MediaItemRenderers'
import { SolidItemRenderer } from './items/SolidItemRenderer'
import { TextItemRenderer } from './items/TextItemRenderer'
import { resolveProp } from './keyframes'
import { getTransitionRenderProps } from './transitions'

export interface RenderContext {
  state: UndoableState
  /** 预览时用本地 blob URL 覆盖远端地址；渲染服务不传 */
  assetUrlOverrides?: Record<string, string>
  /** 字体悬停预览（仅编辑器传） */
  textFontOverride?: { itemId: string, fontFamily: string } | null
}

function resolveUrl(ctx: RenderContext, assetId: string): string | null {
  return ctx.assetUrlOverrides?.[assetId] ?? ctx.state.assets[assetId]?.url ?? null
}

const ItemContent: React.FC<{ item: EditorStarterItem, ctx: RenderContext, trackMuted: boolean }> = ({
  item,
  ctx,
  trackMuted,
}) => {
  switch (item.type) {
    case 'solid':
      return <SolidItemRenderer item={item} />
    case 'custom': {
      // 不是在渲染期「创建」组件,是按 kind 从注册表里取一个早已注册好的 —— 引用随 kind 稳定,
      // 不会每帧换新身份,所以 static-components 担心的重挂载/丢 state 在这里不会发生。
      /* eslint-disable react/static-components */
      const Custom = getCustomItemRenderer(item.kind)
      return Custom ? <Custom item={item} /> : null
      /* eslint-enable react/static-components */
    }
    case 'text':
      return (
        <TextItemRenderer
          item={item}
          fontFamilyOverride={
            ctx.textFontOverride?.itemId === item.id ? ctx.textFontOverride.fontFamily : undefined
          }
        />
      )
    case 'video':
      return (
        <VideoItemRenderer
          item={item}
          asset={ctx.state.assets[item.assetId]}
          url={resolveUrl(ctx, item.assetId)}
          trackMuted={trackMuted}
        />
      )
    case 'audio':
      return <AudioItemRenderer item={item} url={resolveUrl(ctx, item.assetId)} trackMuted={trackMuted} />
    case 'image':
      return (
        <ImageItemRenderer
          item={item}
          asset={ctx.state.assets[item.assetId]}
          url={resolveUrl(ctx, item.assetId)}
        />
      )
    case 'gif':
      return <GifItemRenderer item={item} url={resolveUrl(ctx, item.assetId)} />
    case 'captions': {
      const asset = ctx.state.assets[item.assetId]
      if (!asset || asset.type !== 'caption')
        return null
      return <CaptionsItemRenderer item={item} captions={asset.captions} />
    }
    default:
      return null
  }
}

const ItemPositioner: React.FC<{ item: EditorStarterItem, ctx: RenderContext, trackMuted: boolean }> = ({
  item,
  ctx,
  trackMuted,
}) => {
  const frame = useCurrentFrame() // Sequence 内部：0 = item 开始
  const fadeIn
    = item.fadeInDurationInFrames > 0
      ? interpolate(frame, [0, item.fadeInDurationInFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1
  const fadeOut
    = item.fadeOutDurationInFrames > 0
      ? interpolate(
          frame,
          [item.durationInFrames - item.fadeOutDurationInFrames, item.durationInFrames],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
      : 1
  const left = resolveProp(item, 'left', frame)
  const top = resolveProp(item, 'top', frame)
  const width = resolveProp(item, 'width', frame)
  const height = resolveProp(item, 'height', frame)
  const rotation = resolveProp(item, 'rotation', frame)
  const baseOpacity = resolveProp(item, 'opacity', frame)
  const tp = getTransitionRenderProps(ctx.state, item, item.from + frame)
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        rotate: `${rotation}deg`,
        translate: tp.translate, // 转场位移/缩放:CSS 独立变换属性,与 rotate 自动合成;undefined 无效果
        scale: tp.scale,
        opacity: baseOpacity * fadeIn * fadeOut * tp.opacity,
        clipPath: tp.clipPath, // wipe 揭示
        borderRadius: item.borderRadius,
        overflow: item.borderRadius > 0 ? 'hidden' : undefined,
      }}
    >
      <ItemContent item={item} ctx={ctx} trackMuted={trackMuted} />
    </div>
  )
}

export const ItemRenderer: React.FC<{ item: EditorStarterItem, ctx: RenderContext }> = ({ item, ctx }) => {
  const trackMuted = ctx.state.tracks.find(t => t.id === item.trackId)?.muted ?? false
  // 媒体块提前 1 秒挂载(隐藏且冻结在首帧,不出声):Sequence 一到点才挂载的话，播放头跨过
  // 块边界的瞬间要现建 <Video>、seek 到 trimBefore、再从最近关键帧解码 —— 这就是切开一段
  // 视频后经过切口卡一下的原因。预挂载给它时间缓冲。1 秒 = Remotion v5 起的官方默认值。
  // 非媒体块(文本/色块/字幕)没有缓冲这回事，不必提前挂。
  const premountFor
    = item.type === 'video' || item.type === 'audio' || item.type === 'gif' ? ctx.state.fps : undefined
  return (
    <Sequence
      name={`${item.type}-${item.id}`}
      from={item.from}
      durationInFrames={item.durationInFrames}
      premountFor={premountFor}
    >
      <ItemPositioner item={item} ctx={ctx} trackMuted={trackMuted} />
    </Sequence>
  )
}
