import type React from 'react';
import type { SolidItem } from '@gedatou/shared';
import { useItemPatch } from '../patch';
import { LayoutSection, AnimationSection, FillSection, FadeSection } from '../sections';

/** 色块检查器:布局(可锁比例、默认关) / 动画 / 填充(颜色+圆角) / 淡入淡出(默认展开) */
export const SolidPanel: React.FC<{ item: SolidItem }> = ({ item }) => {
  const patch = useItemPatch(item.id);
  return (
    <>
      <LayoutSection item={item} patch={patch} showLock lockDefault={false} />
      <AnimationSection itemId={item.id} />
      <FillSection item={item} patch={patch} color={item.color} onColor={(v) => patch({ color: v })} showRadius />
      <FadeSection item={item} patch={patch} defaultOpen />
    </>
  );
};
