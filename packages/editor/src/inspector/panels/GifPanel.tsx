import type React from 'react';
import type { GifItem } from '@gedatou/shared';
import { useEditor } from '../../state/context';
import { useItemPatch } from '../patch';
import { SourceSection, LayoutSection, AnimationSection, FillSection, MediaSection } from '../sections';

/** GIF 块检查器:源信息 / 布局 / 动画 / 填充 / 视频区(速度+淡变)。GIF 不可裁剪、无音频。 */
export const GifPanel: React.FC<{ item: GifItem }> = ({ item }) => {
  const patch = useItemPatch(item.id);
  const asset = useEditor((s) => s.undoable.assets[item.assetId]);
  return (
    <>
      {asset && asset.type !== 'caption' ? <SourceSection asset={asset} /> : null}
      <LayoutSection item={item} patch={patch} showLock lockDefault />
      <AnimationSection itemId={item.id} />
      <FillSection item={item} patch={patch} showRadius />
      <MediaSection item={item} />
    </>
  );
};
