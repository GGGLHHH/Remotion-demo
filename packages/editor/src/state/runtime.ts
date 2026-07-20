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
   * baseName = 导出文件基础名（如项目地址），不含时间戳与扩展名；服务端拼上渲染完成时间
   * 生成下载文件名（Content-Disposition）。不传则文件名只有时间戳。 */
  startRender(input: {
    state: UndoableState;
    codec: 'mp4' | 'webm';
    baseName?: string;
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

/** 非 React I/O 模块统一收此依赖包（连同 store 一起从 Provider 线程进来） */
export type EditorDeps = {
  transport: EditorTransport;
  storage: EditorStorage;
  notify: NotifyFn;
  /**
   * 导出文件基础名（如项目地址）。库本身不知道「项目」，由消费方注入。
   * 用取值函数而非常量：消费方切换当前项目时无需重建 editor。
   * 最终下载名 = `${exportBaseName()} ${渲染完成时间}.${codec}`（服务端拼接）。
   */
  exportBaseName?: () => string | undefined;
};
