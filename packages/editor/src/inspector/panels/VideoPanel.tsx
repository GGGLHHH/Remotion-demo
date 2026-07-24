import type React from 'react';
import type { VideoItem } from '@gedatou/shared';
import { useEditor } from '../../state/context';
import { useItemPatch } from '../patch';
import {
  SourceSection,
  LayoutSection,
  AnimationSection,
  FillSection,
  CropSection,
  MediaSection,
  GenerateCaptionsSection,
} from '../sections';

/** 视频块检查器:源信息 / 布局 / 动画 / 填充 / 裁剪 / 视频+音频 / 生成字幕(有音轨时) */
export const VideoPanel: React.FC<{ item: VideoItem }> = ({ item }) => {
  const patch = useItemPatch(item.id);
  const asset = useEditor((s) => s.undoable.assets[item.assetId]);
  const hasAudio = asset?.type === 'video' && asset.hasAudio;
  return (
    <>
      {asset && asset.type !== 'caption' ? <SourceSection asset={asset} /> : null}
      <LayoutSection item={item} patch={patch} showLock lockDefault />
      <AnimationSection itemId={item.id} />
      <FillSection item={item} patch={patch} showRadius />
      {asset && asset.type === 'video' ? (
        <CropSection item={item} mediaW={asset.width} mediaH={asset.height} patch={patch} />
      ) : null}
      <MediaSection item={item} />
      {hasAudio ? <GenerateCaptionsSection itemId={item.id} /> : null}
    </>
  );
};
