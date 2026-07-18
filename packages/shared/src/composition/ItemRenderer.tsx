import type React from 'react';
import { Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { EditorStarterItem } from '../types';
import { SolidItemRenderer } from './items/SolidItemRenderer';
import { TextItemRenderer } from './items/TextItemRenderer';

const ItemContent: React.FC<{ item: EditorStarterItem }> = ({ item }) => {
  switch (item.type) {
    case 'solid':
      return <SolidItemRenderer item={item} />;
    case 'text':
      return <TextItemRenderer item={item} />;
    default:
      // 其余类型在后续里程碑接入（video/image/gif/audio/captions）
      return null;
  }
};

const ItemPositioner: React.FC<{ item: EditorStarterItem }> = ({ item }) => {
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
  return (
    <div
      style={{
        position: 'absolute',
        left: item.left,
        top: item.top,
        width: item.width,
        height: item.height,
        rotate: `${item.rotation}deg`,
        opacity: item.opacity * fadeIn * fadeOut,
        borderRadius: item.borderRadius,
        overflow: item.borderRadius > 0 ? 'hidden' : undefined,
      }}
    >
      <ItemContent item={item} />
    </div>
  );
};

export const ItemRenderer: React.FC<{ item: EditorStarterItem }> = ({ item }) => {
  return (
    <Sequence
      name={`${item.type}-${item.id}`}
      from={item.from}
      durationInFrames={item.durationInFrames}
    >
      <ItemPositioner item={item} />
    </Sequence>
  );
};
