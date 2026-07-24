import type React from 'react';
import type { ImageItem } from '@gedatou/shared';
import { useEditor } from '../../state/context';
import { useItemPatch } from '../patch';
import { SourceSection, LayoutSection, AnimationSection, FillSection, CropSection, FadeSection } from '../sections';

/** 图片块检查器:源信息 / 布局 / 动画 / 填充 / 裁剪 / 淡入淡出 */
export const ImagePanel: React.FC<{ item: ImageItem }> = ({ item }) => {
  const patch = useItemPatch(item.id);
  const asset = useEditor((s) => s.undoable.assets[item.assetId]);
  return (
    <>
      {asset && asset.type !== 'caption' ? <SourceSection asset={asset} /> : null}
      <LayoutSection item={item} patch={patch} showLock lockDefault />
      <AnimationSection itemId={item.id} />
      <FillSection item={item} patch={patch} showRadius />
      {asset && asset.type === 'image' ? (
        <CropSection item={item} mediaW={asset.width} mediaH={asset.height} patch={patch} />
      ) : null}
      <FadeSection item={item} patch={patch} />
    </>
  );
};
