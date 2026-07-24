import type React from 'react';
import type { CaptionsItem } from '@gedatou/shared';
import { useItemPatch } from '../patch';
import { LayoutSection, AnimationSection, FillSection, FadeSection, CaptionsStyleSection } from '../sections';

/** 字幕块检查器:布局(无锁比例) / 动画 / 填充(透明度) / 字幕样式+逐词修正 / 淡入淡出。
 *  源资产为 CaptionAsset(type='caption') → 不显示源信息分区。 */
export const CaptionsPanel: React.FC<{ item: CaptionsItem }> = ({ item }) => {
  const patch = useItemPatch(item.id);
  return (
    <>
      <LayoutSection item={item} patch={patch} showLock={false} lockDefault={false} />
      <AnimationSection itemId={item.id} />
      <FillSection item={item} patch={patch} />
      <CaptionsStyleSection item={item} />
      <FadeSection item={item} patch={patch} />
    </>
  );
};
