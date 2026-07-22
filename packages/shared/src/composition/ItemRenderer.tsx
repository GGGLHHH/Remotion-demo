import type React from 'react';
import { Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { EditorStarterItem, UndoableState } from '../types';
import { getCustomItemRenderer } from '../custom-items';
import { resolveProp } from './keyframes';
import { CaptionsItemRenderer } from './items/CaptionsItemRenderer';
import { SolidItemRenderer } from './items/SolidItemRenderer';
import { TextItemRenderer } from './items/TextItemRenderer';
import { getTransitionRenderProps } from './transitions';
import {
  AudioItemRenderer,
  GifItemRenderer,
  ImageItemRenderer,
  VideoItemRenderer,
} from './items/MediaItemRenderers';

export type RenderContext = {
  state: UndoableState;
  /** 预览时用本地 blob URL 覆盖远端地址；渲染服务不传 */
  assetUrlOverrides?: Record<string, string>;
  /** 字体悬停预览（仅编辑器传） */
  textFontOverride?: { itemId: string; fontFamily: string } | null;
};

const resolveUrl = (ctx: RenderContext, assetId: string): string | null =>
  ctx.assetUrlOverrides?.[assetId] ?? ctx.state.assets[assetId]?.url ?? null;

const ItemContent: React.FC<{ item: EditorStarterItem; ctx: RenderContext; trackMuted: boolean }> = ({
  item,
  ctx,
  trackMuted,
}) => {
  switch (item.type) {
    case 'solid':
      return <SolidItemRenderer item={item} />;
    case 'custom': {
      const Custom = getCustomItemRenderer(item.kind);
      return Custom ? <Custom item={item} /> : null;
    }
    case 'text':
      return (
        <TextItemRenderer
          item={item}
          fontFamilyOverride={
            ctx.textFontOverride?.itemId === item.id ? ctx.textFontOverride.fontFamily : undefined
          }
        />
      );
    case 'video':
      return (
        <VideoItemRenderer
          item={item}
          asset={ctx.state.assets[item.assetId]}
          url={resolveUrl(ctx, item.assetId)}
          trackMuted={trackMuted}
        />
      );
    case 'audio':
      return <AudioItemRenderer item={item} url={resolveUrl(ctx, item.assetId)} trackMuted={trackMuted} />;
    case 'image':
      return (
        <ImageItemRenderer
          item={item}
          asset={ctx.state.assets[item.assetId]}
          url={resolveUrl(ctx, item.assetId)}
        />
      );
    case 'gif':
      return <GifItemRenderer item={item} url={resolveUrl(ctx, item.assetId)} />;
    case 'captions': {
      const asset = ctx.state.assets[item.assetId];
      if (!asset || asset.type !== 'caption') return null;
      return <CaptionsItemRenderer item={item} captions={asset.captions} />;
    }
    default:
      return null;
  }
};

const ItemPositioner: React.FC<{ item: EditorStarterItem; ctx: RenderContext; trackMuted: boolean }> = ({
  item,
  ctx,
  trackMuted,
}) => {
  const frame = useCurrentFrame(); // Sequence 内部：0 = item 开始
  const fadeIn =
    item.fadeInDurationInFrames > 0
      ? interpolate(frame, [0, item.fadeInDurationInFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
  const fadeOut =
    item.fadeOutDurationInFrames > 0
      ? interpolate(
          frame,
          [item.durationInFrames - item.fadeOutDurationInFrames, item.durationInFrames],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
      : 1;
  const left = resolveProp(item, 'left', frame);
  const top = resolveProp(item, 'top', frame);
  const width = resolveProp(item, 'width', frame);
  const height = resolveProp(item, 'height', frame);
  const rotation = resolveProp(item, 'rotation', frame);
  const baseOpacity = resolveProp(item, 'opacity', frame);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        rotate: `${rotation}deg`,
        opacity: baseOpacity * fadeIn * fadeOut * getTransitionRenderProps(ctx.state, item, item.from + frame).opacity,
        borderRadius: item.borderRadius,
        overflow: item.borderRadius > 0 ? 'hidden' : undefined,
      }}
    >
      <ItemContent item={item} ctx={ctx} trackMuted={trackMuted} />
    </div>
  );
};

export const ItemRenderer: React.FC<{ item: EditorStarterItem; ctx: RenderContext }> = ({ item, ctx }) => {
  const trackMuted = ctx.state.tracks.find((t) => t.id === item.trackId)?.muted ?? false;
  return (
    <Sequence
      name={`${item.type}-${item.id}`}
      from={item.from}
      durationInFrames={item.durationInFrames}
    >
      <ItemPositioner item={item} ctx={ctx} trackMuted={trackMuted} />
    </Sequence>
  );
};
