import type { UndoableState } from '@gedatou/shared';

// 时间线拖拽的内部共享类型。原定义在 TimelinePanel.tsx 顶部,抽出供拆分后的浮层/拖拽 hook 共用。均未出 index.ts。

export type DragState =
  | {
      kind: 'trim';
      edge: 'start' | 'end';
      id: string;
      startX: number;
      snapshot: UndoableState;
      /** 滚动编辑(相邻块边界热区)联动的相邻项 */
      rollingNeighborId: string | null;
      /** 是否已越过点击阈值(区分 roll 热区的点击建转场 vs 真实拖拽);普通 trim 不读取 */
      moved: boolean;
    }
  | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number };

/** 移动拖拽的轨道目标:现有行 / 在 index 处插入(bar=行间细条提示,否则渲染虚拟空行) */
export type TrackTarget =
  | { kind: 'existing'; index: number }
  | { kind: 'insert'; index: number; bar: boolean };

/** 移动拖拽簿记(ref,不触发渲染)。官方模型:拖拽中不改 store,松手一次性提交 */
export type MoveDrag = {
  id: string;
  downX: number;
  downY: number;
  /** 指针距块左缘 px */
  grabDX: number;
  /** 指针距行顶 px */
  grabDY: number;
  moved: boolean;
  lastClientX: number;
  lastClientY: number;
  /** 最近一次解析出的合法落点(松手时提交);shifts=插入模式下需右推的其他块新起帧 */
  placement: { target: TrackTarget; from: number; shifts?: Record<string, number> } | null;
};

/** 移动拖拽视觉(React state):幽灵块 + 落位槽 + 吸附线 + 过半阈值线 */
export type MoveVisual = {
  id: string;
  ghostX: number;
  ghostY: number;
  target: TrackTarget;
  slotFrom: number;
  guideFrame: number | null;
  /** 过半阈值线(帧):被拖左缘当前压住块的中线,越过它插到该块前/后翻转;不压任何块时为 null */
  thresholdFrame: number | null;
};
