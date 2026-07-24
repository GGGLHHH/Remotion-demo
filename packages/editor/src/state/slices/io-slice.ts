import type { EditorSet, EditorStore } from '../store';

// I/O 与瞬时任务 slice:素材上传状态/进度/本地 URL、剪贴板、渲染/字幕任务表、循环/静音。
export const createIoSlice = (
  set: EditorSet,
): Pick<
  EditorStore,
  | 'assetStatus'
  | 'setAssetStatus'
  | 'uploadProgress'
  | 'setUploadProgress'
  | 'localUrls'
  | 'setLocalUrl'
  | 'clipboard'
  | 'setClipboard'
  | 'renderingTasks'
  | 'upsertRenderingTask'
  | 'captioningTasks'
  | 'upsertCaptioningTask'
  | 'loop'
  | 'toggleLoop'
  | 'playerMuted'
  | 'togglePlayerMuted'
> => ({
  assetStatus: {},
  setAssetStatus: (assetId, status) => set((s) => ({ assetStatus: { ...s.assetStatus, [assetId]: status } })),
  uploadProgress: {},
  setUploadProgress: (assetId, pct) =>
    set((s) => {
      if (pct === null) {
        const { [assetId]: _removed, ...rest } = s.uploadProgress;
        return { uploadProgress: rest };
      }
      return { uploadProgress: { ...s.uploadProgress, [assetId]: pct } };
    }),
  localUrls: {},
  setLocalUrl: (assetId, url) => set((s) => ({ localUrls: { ...s.localUrls, [assetId]: url } })),
  clipboard: [],
  setClipboard: (items) => set({ clipboard: items }),
  renderingTasks: [],
  upsertRenderingTask: (task) =>
    set((s) => {
      const i = s.renderingTasks.findIndex((t) => t.id === task.id);
      if (i === -1) return { renderingTasks: [...s.renderingTasks, task] };
      const next = [...s.renderingTasks];
      next[i] = task;
      return { renderingTasks: next };
    }),
  captioningTasks: [],
  upsertCaptioningTask: (task) =>
    set((s) => {
      const i = s.captioningTasks.findIndex((t) => t.id === task.id);
      if (i === -1) return { captioningTasks: [...s.captioningTasks, task] };
      const next = [...s.captioningTasks];
      next[i] = task;
      return { captioningTasks: next };
    }),
  loop: true,
  toggleLoop: () => set((s) => ({ loop: !s.loop })),
  playerMuted: false,
  togglePlayerMuted: () => set((s) => ({ playerMuted: !s.playerMuted })),
});
