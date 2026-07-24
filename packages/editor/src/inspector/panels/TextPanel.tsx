import type React from 'react';
import type { TextItem } from '@gedatou/shared';
import { useItemPatch } from '../patch';
import {
  LayoutSection,
  AnimationSection,
  FillSection,
  FadeSection,
  TypographySection,
  StrokeSection,
  BackgroundSection,
} from '../sections';

/** 文本块检查器:布局(无锁比例) / 动画 / 排版 / 填充(颜色) / 描边 / 背景 / 淡入淡出 */
export const TextPanel: React.FC<{ item: TextItem }> = ({ item }) => {
  const patch = useItemPatch(item.id);
  return (
    <>
      <LayoutSection item={item} patch={patch} showLock={false} lockDefault={false} />
      <AnimationSection itemId={item.id} />
      <TypographySection item={item} />
      <FillSection item={item} patch={patch} color={item.color} onColor={(v) => patch({ color: v })} />
      <StrokeSection item={item} />
      <BackgroundSection item={item} />
      <FadeSection item={item} patch={patch} />
    </>
  );
};
