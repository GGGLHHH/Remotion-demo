import type { EditorStoreApi } from '../state/store';
import type { EditorDeps, RenderProgress } from '../state/runtime';

/** 发起渲染并轮询进度直到终态；错误落到任务列表而不是抛出。
 * notify 只在终态触发一次（每个终态路径都直接 return，不会重复）。 */
export const startRender = async (
  store: EditorStoreApi,
  deps: EditorDeps,
  codec: 'mp4' | 'webm',
): Promise<void> => {
  const { undoable, upsertRenderingTask } = store.getState();
  let taskId: string;
  try {
    ({ taskId } = await deps.transport.startRender({ state: undoable, codec }));
  } catch (err) {
    upsertRenderingTask({ id: `local-${Date.now()}`, status: 'error', progress: 0, error: String(err), codec });
    deps.notify('渲染任务创建失败', 'error');
    return;
  }
  upsertRenderingTask({ id: taskId, status: 'queued', progress: 0, codec });
  while (true) {
    await new Promise((r) => setTimeout(r, 1000));
    let task: RenderProgress;
    try {
      // 404 = 服务端重启丢了任务表，renderProgress 抛错终止轮询
      task = await deps.transport.renderProgress(taskId);
    } catch (err) {
      store.getState().upsertRenderingTask({ id: taskId, status: 'error', progress: 0, error: String(err), codec });
      deps.notify('渲染失败', 'error');
      return;
    }
    store.getState().upsertRenderingTask({ id: taskId, codec, ...task });
    if (task.status === 'done') {
      deps.notify('渲染完成，可在渲染面板下载', 'success');
      return;
    }
    if (task.status === 'error') {
      deps.notify('渲染失败', 'error');
      return;
    }
  }
};
