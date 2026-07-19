/** 画布适配缩放值：CanvasView 布局时持续写入（手动缩放下也跟踪"适应"应为的值，
 * 供工具栏对比与快捷键相对缩放做基准） */
export const fitScaleRef = { current: 1 };

/** 舞台平移偏移（容器坐标系 px）：Figma 式自由视口的原点；居中只是"适应"模式下的派生值 */
export const panRef = { current: { x: 0, y: 0 } };

/** 舞台 DOM 节点（CanvasView 渲染时写入），供 setPan 直写样式 */
export const stageElRef = { current: null as HTMLElement | null };

/** 更新平移：直写 DOM（left/top），不触发 React 重渲——Player 子树完全不动 */
export const setPan = (x: number, y: number) => {
  panRef.current = { x, y };
  const el = stageElRef.current;
  if (el) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
};
