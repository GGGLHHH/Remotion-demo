import type { EditorSet, EditorStore } from '../store';

// 视图/编辑态 UI slice:画布与时间线缩放/高度/吸附、行内编辑/裁剪/字体悬停等瞬时 UI 标志。全是纯 setter。
export const createViewSlice = (
  set: EditorSet,
): Pick<
  EditorStore,
  | 'canvasZoom'
  | 'setCanvasZoom'
  | 'canvasTool'
  | 'setCanvasTool'
  | 'timelineZoom'
  | 'setTimelineZoom'
  | 'timelineHeight'
  | 'setTimelineHeight'
  | 'snappingEnabled'
  | 'toggleSnapping'
  | 'textItemEditing'
  | 'setTextItemEditing'
  | 'itemSelectedForCrop'
  | 'setItemSelectedForCrop'
  | 'fontHoverPreview'
  | 'setFontHoverPreview'
> => ({
  canvasZoom: 'fit',
  setCanvasZoom: (zoom) => set({ canvasZoom: zoom === 'fit' ? zoom : Math.min(4, Math.max(0.1, zoom)) }),
  canvasTool: null,
  setCanvasTool: (tool) => set({ canvasTool: tool }),
  timelineZoom: 'fit',
  setTimelineZoom: (zoom) => set({ timelineZoom: zoom === 'fit' ? zoom : Math.min(8, Math.max(0.1, zoom)) }),
  timelineHeight: 224,
  setTimelineHeight: (h) => set({ timelineHeight: Math.min(500, Math.max(120, h)) }),
  snappingEnabled: true,
  toggleSnapping: () => set((s) => ({ snappingEnabled: !s.snappingEnabled })),
  textItemEditing: null,
  setTextItemEditing: (id) => set({ textItemEditing: id }),
  itemSelectedForCrop: null,
  setItemSelectedForCrop: (id) => set({ itemSelectedForCrop: id }),
  fontHoverPreview: null,
  setFontHoverPreview: (v) => set({ fontHoverPreview: v }),
});
