import type { Caption, UndoableState } from '@gedatou/shared';

/** 渲染进度快照（transport.renderProgress 返回 / 与 store RenderingTask 对齐） */
export type RenderProgress = {
  status: 'queued' | 'rendering' | 'done' | 'error';
  progress: number;
  url?: string;
  error?: string;
};

/**
 * 服务端 I/O 边界：替代库内写死的 fetch('/api/*')。默认实现打同源 /api（见 lib/adapters/http-transport），
 * 消费方可注入指向自家后端的实现。保持薄 I/O 原语——渲染轮询/状态编排留在 lib/render-client。
 */
export interface EditorTransport {
  /** 上传素材（内部 sign + 带进度 PUT）→ 远端可访问 url */
  uploadAsset(file: File, opts?: { onProgress?: (pct: number) => void }): Promise<{ url: string }>;
  /** 删除远端素材（传素材 url，实现方自行推导对象 key） */
  deleteRemoteAsset(url: string): Promise<void>;
  /** 发起渲染 → 任务 id。
   * fileName = 完整下载文件名（含扩展名），由前端组装（见 lib/render-client）；
   * 服务端清洗后挂到产物的 Content-Disposition。不传则由服务端用自己的默认名。 */
  startRender(input: {
    state: UndoableState;
    codec: 'mp4' | 'webm';
    fileName?: string;
  }): Promise<{ taskId: string }>;
  /** 查一次渲染进度（轮询循环在调用方） */
  renderProgress(taskId: string): Promise<RenderProgress>;
  /** 音频（wav）→ 字幕（whisper 转录；抽音在客户端） */
  generateCaptions(wav: Blob): Promise<{ captions: Caption[] }>;
}

/**
 * 持久化 + 素材本地缓存边界：替代库内写死的 localStorage / window.location.hash / IndexedDB。
 * 默认实现见 lib/adapters/browser-storage，消费方可注入自家持久层。
 */
export interface EditorStorage {
  /** 载入工程（默认：URL hash > localStorage） */
  loadProject(): UndoableState | null | Promise<UndoableState | null>;
  /** 保存工程 */
  saveProject(state: UndoableState): void | Promise<void>;
  /** 取素材本地缓存（默认 IndexedDB） */
  getAsset(assetId: string): Promise<Blob | null>;
  /** 写素材本地缓存 */
  putAsset(assetId: string, blob: Blob): Promise<void>;
  /** 删素材本地缓存 */
  deleteAsset(assetId: string): Promise<void>;
}

/** 用户提示边界：替代库内写死的 sonner。默认实现见 lib/adapters/notify */
export type NotifyFn = (message: string, level?: 'info' | 'success' | 'error') => void;

/**
 * 文本解析器（可选注入）：库本身不做 i18n（不切语言、不内置多语言、不引 i18n 依赖），
 * 只把「文本」当作又一个 app 关注点外包给消费方——和 transport/storage/notify 同一个注入哲学。
 * (key, params) => 译文。不注入、或对某 key 返回 key 本身时，回落库内置 en 默认字典（见 locales/en）。
 * 消费方（如接了 react-i18next 的宿主）注入自己的 t 即可让编辑器跟随宿主语言，库一行不用改。
 */
export type EditorT = (key: string, params?: Record<string, string | number>) => string;

/** 非 React I/O 模块统一收此依赖包（连同 store 一起从 Provider 线程进来） */
export type EditorDeps = {
  transport: EditorTransport;
  storage: EditorStorage;
  notify: NotifyFn;
  /** 文本解析器（可选）：不传则用库内置 en 默认文案。见 EditorT。 */
  t?: EditorT;
  /**
   * 导出下载文件名（完整，含扩展名），点击导出时调用。库不含命名策略（项目名/时间戳
   * 等约定由消费方组装）；不注入或返回 undefined 则不指定名字，渲染服务用自己的默认名
   * （如任务 id）。用函数而非常量：消费方切换当前项目时无需重建 editor。
   */
  exportFileName?: (codec: 'mp4' | 'webm') => string | undefined;
};
