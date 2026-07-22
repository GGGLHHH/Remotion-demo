import { tFor } from './i18n';
import type { EditorStoreApi } from '../state/store';
import type { EditorDeps, RenderProgress } from '../state/runtime';

/** 发起渲染并轮询进度直到终态；错误落到任务列表而不是抛出。
 * notify 只在终态触发一次（每个终态路径都直接 return，不会重复）。 */
export const startRender = async (
  store: EditorStoreApi,
  deps: EditorDeps,
  codec: 'mp4' | 'webm',
): Promise<void> => {
  const t = tFor(deps);
  const { undoable, upsertRenderingTask } = store.getState();
  // 文件名由消费方组装（exportFileName 注入，库无命名策略）；服务端只做防御性清洗并挂
  // Content-Disposition。点下就有名字 → 任务卡片全程可显示；不注入则渲染服务回退默认名。
  const fileName = deps.exportFileName?.(codec);
  let taskId: string;
  try {
    ({ taskId } = await deps.transport.startRender({ state: undoable, codec, fileName }));
  } catch (err) {
    upsertRenderingTask({ id: `local-${Date.now()}`, status: 'error', progress: 0, error: String(err), codec, fileName });
    deps.notify(t('render.createFailed'), 'error');
    return;
  }
  upsertRenderingTask({ id: taskId, status: 'queued', progress: 0, codec, fileName });
  while (true) {
    await new Promise((r) => setTimeout(r, 1000));
    let task: RenderProgress;
    try {
      // 404 = 服务端重启丢了任务表，renderProgress 抛错终止轮询
      task = await deps.transport.renderProgress(taskId);
    } catch (err) {
      store.getState().upsertRenderingTask({ id: taskId, status: 'error', progress: 0, error: String(err), codec, fileName });
      deps.notify(t('render.failed'), 'error');
      return;
    }
    store.getState().upsertRenderingTask({ id: taskId, codec, fileName, ...task });
    if (task.status === 'done') {
      deps.notify(t('render.done'), 'success');
      return;
    }
    if (task.status === 'error') {
      deps.notify(t('render.failed'), 'error');
      return;
    }
  }
};
