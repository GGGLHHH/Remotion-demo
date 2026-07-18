import type React from 'react';
import { Img } from 'remotion';
import { Audio, Video } from '@remotion/media';
import { Gif } from '@remotion/gif';
import type { Crop, GifItem, ImageItem, VideoItem, AudioItem, EditorStarterAsset } from '../../types';

/** crop 渲染：外层裁剪窗口，内层原图按比例放大平移 */
const croppedStyle = (
  crop: Crop | null,
  asset: { width: number; height: number },
  itemW: number,
  itemH: number,
): React.CSSProperties => {
  if (!crop) return { width: '100%', height: '100%', objectFit: 'fill' as const };
  const scaleX = itemW / crop.width;
  const scaleY = itemH / crop.height;
  return {
    position: 'absolute',
    width: asset.width * scaleX,
    height: asset.height * scaleY,
    left: -crop.left * scaleX,
    top: -crop.top * scaleY,
    maxWidth: 'none',
    objectFit: 'fill' as const,
  };
};

/** 音量回调：基础音量 × 淡入淡出（f 为 Sequence 内帧） */
export const volumeWithFades = (item: {
  volume: number;
  fadeInDurationInFrames: number;
  fadeOutDurationInFrames: number;
  durationInFrames: number;
}) => {
  const { volume, fadeInDurationInFrames: fi, fadeOutDurationInFrames: fo, durationInFrames: dur } = item;
  if (fi === 0 && fo === 0) return volume;
  return (f: number) => {
    let v = volume;
    if (fi > 0 && f < fi) v *= f / fi;
    if (fo > 0 && f > dur - fo) v *= Math.max(0, (dur - f) / fo);
    return v;
  };
};

export const VideoItemRenderer: React.FC<{
  item: VideoItem;
  asset: EditorStarterAsset | undefined;
  url: string | null;
  trackMuted: boolean;
}> = ({ item, asset, url, trackMuted }) => {
  if (!url || !asset || asset.type !== 'video') return null;
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <Video
        src={url}
        trimBefore={item.trimBefore}
        playbackRate={item.playbackRate}
        muted={item.muted || trackMuted}
        volume={volumeWithFades(item)}
        style={croppedStyle(item.crop, asset, item.width, item.height)}
      />
    </div>
  );
};

export const AudioItemRenderer: React.FC<{ item: AudioItem; url: string | null; trackMuted: boolean }> = ({
  item,
  url,
  trackMuted,
}) => {
  if (!url) return null;
  return (
    <Audio
      src={url}
      trimBefore={item.trimBefore}
      playbackRate={item.playbackRate}
      muted={item.muted || trackMuted}
      volume={volumeWithFades(item)}
    />
  );
};

export const ImageItemRenderer: React.FC<{
  item: ImageItem;
  asset: EditorStarterAsset | undefined;
  url: string | null;
}> = ({ item, asset, url }) => {
  if (!url || !asset || asset.type !== 'image') return null;
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <Img src={url} style={croppedStyle(item.crop, asset, item.width, item.height)} />
    </div>
  );
};

export const GifItemRenderer: React.FC<{ item: GifItem; url: string | null }> = ({ item, url }) => {
  if (!url) return null;
  return <Gif src={url} width={item.width} height={item.height} fit="fill" />;
};
