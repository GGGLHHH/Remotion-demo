import type React from 'react';
import type { AudioItem } from '@gedatou/shared';
import { useEditor } from '../../state/context';
import { SourceSection, MediaSection, GenerateCaptionsSection } from '../sections';

/** 音频块检查器:无画面 → 无布局/动画/填充。源信息 / 音频区 / 生成字幕 */
export const AudioPanel: React.FC<{ item: AudioItem }> = ({ item }) => {
  const asset = useEditor((s) => s.undoable.assets[item.assetId]);
  return (
    <>
      {asset && asset.type !== 'caption' ? <SourceSection asset={asset} /> : null}
      <MediaSection item={item} />
      <GenerateCaptionsSection itemId={item.id} />
    </>
  );
};
