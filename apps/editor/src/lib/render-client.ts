import { useEditorStore } from '../state/store';

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** 发起渲染并轮询进度直到终态；错误落到任务列表而不是抛出 */
export const startRender = async (codec: 'mp4' | 'webm'): Promise<void> => {
  const { undoable, upsertRenderingTask } = useEditorStore.getState();
  let taskId: string;
  try {
    const res = await post('/api/render', { state: undoable, codec });
    if (!res.ok) throw new Error(`render request failed: ${res.status}`);
    ({ taskId } = await res.json());
  } catch (err) {
    upsertRenderingTask({ id: `local-${Date.now()}`, status: 'error', progress: 0, error: String(err), codec });
    return;
  }
  upsertRenderingTask({ id: taskId, status: 'queued', progress: 0, codec });
  while (true) {
    await new Promise((r) => setTimeout(r, 1000));
    let task: { status: 'queued' | 'rendering' | 'done' | 'error'; progress: number; url?: string; error?: string };
    try {
      const res = await post('/api/progress', { taskId });
      // 404 = 服务端重启丢了任务表，终止轮询
      if (!res.ok) throw new Error(`progress failed: ${res.status}`);
      task = await res.json();
    } catch (err) {
      useEditorStore.getState().upsertRenderingTask({ id: taskId, status: 'error', progress: 0, error: String(err), codec });
      return;
    }
    useEditorStore.getState().upsertRenderingTask({ id: taskId, codec, ...task });
    if (task.status === 'done' || task.status === 'error') return;
  }
};
