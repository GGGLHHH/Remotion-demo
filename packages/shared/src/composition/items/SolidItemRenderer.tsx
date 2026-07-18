import type React from 'react';
import type { SolidItem } from '../../types';

export const SolidItemRenderer: React.FC<{ item: SolidItem }> = ({ item }) => {
  return <div style={{ width: '100%', height: '100%', backgroundColor: item.color }} />;
};
