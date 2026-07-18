import type React from 'react';
import type { TextItem } from '../../types';

export const TextItemRenderer: React.FC<{ item: TextItem }> = ({ item }) => {
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
      <div
        style={{
          fontFamily: item.fontFamily,
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
