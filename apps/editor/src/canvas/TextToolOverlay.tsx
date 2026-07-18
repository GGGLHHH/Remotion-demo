import type React from 'react';
import { addTextItem } from '../lib/add-items';

/** 文本工具：点击画布放置一个自适应尺寸的文本项（不进入行内编辑），随后退出模式 */
export const TextToolOverlay: React.FC<{ scale: number; onDone: () => void }> = ({
  scale,
  onDone,
}) => (
  <div
    className="absolute inset-0 z-30 cursor-text"
    onPointerDown={(e) => {
      if (e.button !== 0) return;
      const r = e.currentTarget.getBoundingClientRect();
      addTextItem({ x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale });
      onDone();
    }}
  />
);
