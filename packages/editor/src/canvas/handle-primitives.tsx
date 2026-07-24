import type React from 'react';
import type { ResizeHandle } from './geometry';

// 缩放手柄的共享原语(角手柄/边缘热区/尺寸徽章)。原挂在 SelectionOverlay.tsx 上,被 CompositionResizeHandles
// 与 DrawSolidOverlay 反向 import(平级 overlay 互相耦合);搬到此中性文件,理顺依赖方向。均未出 index.ts,非公共 API。

/** 官方样式:仅 4 个角手柄(约 8px 白色方块、蓝边) */
export const CORNERS: { handle: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { handle: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { handle: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { handle: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { handle: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
];

/** 边缘全长隐形热区(±4px),沿整条边都可拖拽缩放 */
export const EDGES: { handle: ResizeHandle; cursor: string; style: React.CSSProperties }[] = [
  { handle: 'n', cursor: 'ns-resize', style: { left: 0, right: 0, top: -4, height: 8 } },
  { handle: 's', cursor: 'ns-resize', style: { left: 0, right: 0, bottom: -4, height: 8 } },
  { handle: 'w', cursor: 'ew-resize', style: { top: 0, bottom: 0, left: -4, width: 8 } },
  { handle: 'e', cursor: 'ew-resize', style: { top: 0, bottom: 0, right: -4, width: 8 } },
];

/** 选中项下方的蓝色 W×H 尺寸徽章(移动/缩放/绘制中实时更新) */
export const SizeBadge: React.FC<{ width: number; height: number }> = ({ width, height }) => (
  <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0B84F3] px-2 py-0.5 text-xs font-medium text-white">
    {Math.round(width)} × {Math.round(height)}
  </div>
);
