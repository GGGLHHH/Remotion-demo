import type React from 'react';
import type { CustomItem } from '@gedatou/shared';
import { useEditorDeps } from '../../state/context';
import { useItemPatch } from '../patch';
import { LayoutSection, AnimationSection, FadeSection } from '../sections';

/** 自定义业务块检查器:宿主经 deps.customItemPanels[kind] 提供的领域面板(渲染在通用分区之前),
 *  之后是通用的 布局(无锁比例) / 动画 / 淡入淡出。 */
export const CustomPanel: React.FC<{ item: CustomItem }> = ({ item }) => {
  const deps = useEditorDeps();
  const patch = useItemPatch(item.id);
  const Domain = deps.customItemPanels?.[item.kind];
  return (
    <>
      {Domain ? <Domain item={item} /> : null}
      <LayoutSection item={item} patch={patch} showLock={false} lockDefault={false} />
      <AnimationSection itemId={item.id} />
      <FadeSection item={item} patch={patch} />
    </>
  );
};
