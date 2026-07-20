import type { EditorTransport, RenderProgress } from '../../state/runtime';

/** XHR PUT：fetch 拿不到上传进度，用 XHR 的 upload.onprogress */
const putWithProgress = (url: string, file: File, contentType: string, onProgress: (pct: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload PUT failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('upload PUT network error'));
    xhr.send(file);
  });

/** 默认 transport：打同源 /api（可传 baseUrl 指向自家后端）。仅 demo 用——库组件本身只认接口。 */
export function createHttpTransport({ baseUrl = '/api' }: { baseUrl?: string } = {}): EditorTransport {
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return {
    async uploadAsset(file, opts) {
      const contentType = file.type || 'application/octet-stream';
      const res = await post('/upload', { filename: file.name, contentType });
      if (!res.ok) throw new Error(`upload sign failed: ${res.status}`);
      const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };
      await putWithProgress(uploadUrl, file, contentType, (pct) => opts?.onProgress?.(pct));
      return { url: publicUrl };
    },
    async deleteRemoteAsset(url) {
      // URL 形如 <publicBaseUrl>/<bucket>/assets/xxx，bucket 之后即对象 key
      const key = new URL(url).pathname.split('/').slice(2).join('/');
      await post('/delete-asset', { key }).catch(() => null);
    },
    async startRender({ state, codec, fileName }) {
      const res = await post('/render', { state, codec, fileName });
      if (!res.ok) throw new Error(`render request failed: ${res.status}`);
      return (await res.json()) as { taskId: string };
    },
    async renderProgress(taskId) {
      const res = await post('/progress', { taskId });
      if (!res.ok) throw new Error(`progress failed: ${res.status}`);
      return (await res.json()) as RenderProgress;
    },
    async generateCaptions(wav) {
      const form = new FormData();
      form.append('file', wav, 'audio.wav');
      const res = await fetch(`${baseUrl}/captions`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`转录失败: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    },
  };
}
