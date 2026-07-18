import type React from 'react';
import { AbsoluteFill } from 'remotion';
import type { UndoableState } from '../types';
import { getOrderedItems } from './ordering';
import { ItemRenderer } from './ItemRenderer';

export const MainComposition: React.FC<{
  state: UndoableState;
  assetUrlOverrides?: Record<string, string>;
  textFontOverride?: { itemId: string; fontFamily: string } | null;
}> = ({ state, assetUrlOverrides, textFontOverride }) => {
  const ctx = { state, assetUrlOverrides, textFontOverride };
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {getOrderedItems(state).map((item) => (
        <ItemRenderer key={item.id} item={item} ctx={ctx} />
      ))}
    </AbsoluteFill>
  );
};
