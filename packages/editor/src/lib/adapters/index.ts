// 默认适配器（@gedatou/editor/adapters）：同源 /api transport + 浏览器 localStorage/IndexedDB storage。
// 消费方可直接用，或以此为参照实现自家 EditorTransport / EditorStorage。notify 由消费方提供（避免烘死 toast 库）。
export { createHttpTransport } from './http-transport';
export { createBrowserStorage } from './browser-storage';
