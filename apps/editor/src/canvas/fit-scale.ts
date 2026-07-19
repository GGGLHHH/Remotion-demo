/** 画布适配缩放值：CanvasView 布局时写入，快捷键/工具栏做相对缩放时读取 */
export const fitScaleRef = { current: 1 };

/** 画布手柄拖拽期间冻结适配重算（拖拽中比例变化会让内容漂移） */
export const suppressRefitRef = { current: false };
/** 手动触发一次适配重算（拖拽结束后恢复；CanvasView 挂载时赋值） */
export const canvasRefitRef: { current: () => void } = { current: () => {} };
