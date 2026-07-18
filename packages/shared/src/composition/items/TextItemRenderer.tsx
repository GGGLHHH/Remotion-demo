import type React from 'react';
import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import type { TextItem } from '../../types';
import { ensureFontLoaded } from '../fonts';

/** 字体加载栅栏：渲染端 delayRender 保证字体就绪后才截帧 */
const FontGate: React.FC<{ family: string }> = ({ family }) => {
  const [handle] = useState(() => delayRender(`font: ${family}`));
  useEffect(() => {
    ensureFontLoaded(family)
      .then(() => continueRender(handle))
      .catch((err) => cancelRender(err));
  }, [family, handle]);
  return null;
};

export const TextItemRenderer: React.FC<{ item: TextItem; fontFamilyOverride?: string }> = ({
  item,
  fontFamilyOverride,
}) => {
  const fontFamily = fontFamilyOverride ?? item.fontFamily;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          item.textAlign === 'left'
            ? 'flex-start'
            : item.textAlign === 'right'
              ? 'flex-end'
              : 'center',
        direction: item.direction,
      }}
    >
      <FontGate key={fontFamily} family={fontFamily} />
      <div
        style={{
          fontFamily,
          fontWeight: item.fontWeight,
          fontStyle: item.fontStyle,
          fontSize: item.fontSize,
          color: item.color,
          lineHeight: item.lineHeight,
          letterSpacing: item.letterSpacing,
          textAlign: item.textAlign,
          whiteSpace: 'pre-wrap',
          width: '100%',
          WebkitTextStroke:
            item.strokeWidth > 0 ? `${item.strokeWidth}px ${item.strokeColor}` : undefined,
          backgroundColor: item.backgroundColor ?? undefined,
          padding: item.backgroundPadding,
          borderRadius: item.backgroundBorderRadius,
        }}
      >
        {item.text}
      </div>
    </div>
  );
};
