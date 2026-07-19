# npm 库封装契约（2026-07-20）

把 Remotion 编辑器从「一个 App」重构为「可 `npm install` 的组件库」，写法照搬 shadcn（**不走 registry**）。
本文件是**冻结的契约**：大规模改文件时对照执行，任何偏离都要先改本文件再改代码，防止跑偏。

## 0. 已锁决策（不再议）

- 分发 = 传统 npm 包（`npm install`），**不用** shadcn registry。
- scope = `@gedatou`（用户 npm 用户名，个人 scope，`npm publish --access public`）。
- store：全局单例 → `createEditorStore` 工厂 + `<EditorProvider>` + `useEditor()`（每实例、可注入、SSR 友好）。
- CSS：策略 1（发源码 + token `styles.css`，消费方加 `@source`），**要求消费方 Tailwind v4**。
- 粒度：`<EditorRoot>` 一站式 **和** 单面板积木都发。
- Remotion 全家锁 `4.0.491` 做 **peer**（双份致命）。
- 目标运行时：React 19（零 `forwardRef`）、ESM-only。

## 1. 包结构 & 物理布局

| 包 | 由谁变来 | 角色 |
|---|---|---|
| `@gedatou/shared` | 今 `packages/shared`（`@editor/shared`） | 数据模型 + Remotion 合成。改名 + 加 peer + 去 private，基本现成。 |
| `@gedatou/editor` | **新建 `packages/editor/`**，功能代码从 `apps/editor/src` 迁入 | 编辑器功能层 + 内置 shadcn UI 原语。真正的产品。 |
| `apps/editor` | 保留，瘦身 | **降级为 demo，`@gedatou/editor` 的第一个消费方**。留 `App.tsx` 外壳、demo-state、把注入适配器（http transport / localStorage / sonner）接上。 |
| `apps/server` | 不动 | 自托管后端，app-only，永不进库。 |

**为什么必须物理拆包、让 app 变消费方**：只有存在一个独立消费方，才能真正验证「解耦是否成立」——把 `App.tsx` 里能做到的事全逼到公开 API 上，任何漏掉的耦合当场暴露。留在 `apps/editor` 里「既是库又是 app」会永远验证不了消费者体验。

迁入 `packages/editor/src` 的目录：`canvas/ timeline/ inspector/ playback/ shortcuts/ state/ persistence/ caching/ lib/ hooks/ components/ui/`。
**不迁**（留 `apps/editor`）：`App.tsx`、`main.tsx`、`demo-state.ts`、`index.html`、`window.__editorStore/__playerRef` e2e 钩子、vite 配置。

## 2. Store 契约（封装模式的心脏）

```ts
// @gedatou/editor/state
export type EditorStoreApi = StoreApi<EditorStore>          // vanilla store（zustand/vanilla createStore）
export function createEditorStore(init?: Partial<EditorInitialState>): EditorStoreApi
//   pendingBase 从模块级 let 挪进工厂闭包，也变每实例
```

```tsx
// @gedatou/editor/context
export interface EditorInstanceRefs { player, pan, fitScale, stageEl }   // canvas 那几个模块单例的新家
export function EditorProvider(props: {
  children
  initialState?: Partial<EditorInitialState>
  transport?: EditorTransport
  storage?: EditorStorage
  onNotify?: NotifyFn
}): JSX.Element
//   内部：const store = useRef(createEditorStore(initialState)).current
//         const refs  = useRef<EditorInstanceRefs>({ ... }).current
//         把 store / refs / deps 一起放进 EditorContext

export function useEditor<T>(selector: (s: EditorStore) => T): T   // 替换 useEditorStore；越界即 throw
export function useEditorApi(): EditorStoreApi                     // 拿裸 store，供组件内命令式 getState()/subscribe()（性能敏感的直写 DOM 路径用）
export function useEditorRefs(): EditorInstanceRefs                // 替换 playerRef/panRef/fitScaleRef/stageElRef
export function useEditorDeps(): { transport; storage; onNotify }  // 组件内拿注入依赖
```

**越界 throw 文案**统一：`useEditor 必须在 <EditorProvider> 内使用`（照 shadcn `useSidebar` 同款守卫）。

## 3. 非 React 模块规则（8 个文件）

`lib/*`、`persistence/*`、`caching/*`、`shortcuts/useShortcuts.ts` 里跑在 React 外、今天调 `useEditorStore.getState()` 的函数，**一律改成显式收参**，禁止任何模块级单例：

```ts
// before
export function importFiles(files: File[]) { useEditorStore.getState().updateUndoable(...) }
// after
export function importFiles(store: EditorStoreApi, deps: EditorDeps, files: File[]) {
  store.getState().updateUndoable(...)
}
```
`EditorDeps = { transport: EditorTransport; storage: EditorStorage; onNotify: NotifyFn }`。
调用方（组件 / `useShortcuts`）通过 `useEditorApi()` + `useEditorDeps()` 取到后传进去。

涉及文件（grep 实测）：`lib/{render-client,import-assets,captioning,cleanup-assets,clipboard,add-items}.ts`、`persistence/persistence.ts`、`shortcuts/useShortcuts.ts`。

## 4. 注入接口（冻结形状；精确签名在竖切阶段照原文件定稿）

```ts
export interface EditorTransport {                      // 替换写死的 /api/*
  uploadAsset(file: File, opts?: { signal?: AbortSignal; onProgress?(pct: number): void }): Promise<UploadedAsset>
  deleteAsset(assetId: string): Promise<void>
  startRender(input: RenderInput): Promise<{ renderId: string }>
  subscribeRenderProgress(renderId: string, cb: (p: RenderProgress) => void): () => void   // 保持现有轮询语义
  renderDownloadUrl(renderId: string): string
  generateCaptions(input: { assetId: string; language?: string }): Promise<Caption[]>
}
export interface EditorStorage {                        // 替换 localStorage/IndexedDB/location.hash
  loadProject(): Promise<PersistedProject | null> | PersistedProject | null
  saveProject(p: PersistedProject): Promise<void> | void
  getAsset(assetId: string): Promise<Blob | null>       // 原 IndexedDB 资源缓存
  putAsset(assetId: string, blob: Blob): Promise<void>
}
export type NotifyFn = (message: string, level?: 'info' | 'success' | 'error') => void   // 替换 sonner
```
覆盖文件：Transport → `render-client/import-assets/captioning/cleanup-assets`；Storage → `persistence/indexeddb`；Notify → `captioning/import-assets/render-client/persistence`。

**默认适配器不进组件**，作为可选导出（demo 用）：`createHttpTransport({ baseUrl })`、`createBrowserStorage()`、sonner 版 notify。放 `@gedatou/editor/adapters` 子路径或干脆留在 demo。库组件本身只认接口，零默认后端。

## 5. 公开导出面（冻结命名）

```ts
// @gedatou/editor（root export）
export { EditorRoot, EditorProvider, createEditorStore, useEditor, useEditorApi, useEditorRefs, useEditorDeps }
export { Canvas, Timeline, Inspector, PlaybackBar, useShortcuts }
export type { EditorTransport, EditorStorage, NotifyFn, EditorInitialState, EditorStoreApi }
```
公开组件名用友好版：`CanvasView → Canvas`、`TimelinePanel → Timeline`（内部文件名可不改，在 index 里 `export { CanvasView as Canvas }`）。
每个组件同时给一个 `exports` 子路径（`./canvas`、`./timeline`、`./inspector`、`./playback`）便于 tree-shake。

## 6. 切割线：什么永远 app-only

`apps/server` 整个；`App.tsx` 外壳（header/toolbar/文件选择/save·download UI）；`demo-state.ts`；`window.__editorStore/__playerRef` e2e 钩子；`main.tsx`/`index.html`/vite 配置；写死的 `/api/*`、`localStorage` key、`location.hash`、单库名 IndexedDB（藏到注入接口后）。
**判据**：凡命名了 URL / storage key / `window` / `document` / `localStorage` / `indexedDB` / `sonner` 的东西 → 宿主注入，库不拥有。

## 7. 依赖归类

- **peer**（宿主给，双份致命）：`react`/`react-dom`(^19)、`remotion` + `@remotion/{player,media,gif,google-fonts,captions}`(=4.0.491)、`zustand`(^5)、`mediabunny`、`tailwindcss`(^4，build-time)、`lucide-react`。
- **bundle**（小、去重）：`clsx`、`tailwind-merge`、`class-variance-authority`。
- **从库删**（app-shell dep）：`sonner`、`next-themes`、`recharts`、`embla-carousel-react`、`cmdk`、`input-otp`、`react-day-picker`、`date-fns`、`@fontsource-variable/geist`、`react-resizable-panels`。sonner 的耦合改 `onNotify`，不 bundle toast 库。

## 8. 打包 & CSS

- `tsup`：`format:['esm']`、`dts:true`、`banner:{js:'"use client"'}`、`sideEffects:["**/*.css"]`、`treeshake`、external peer。CI 另跑 `tsc --noEmit` 做真类型检查。
- 发 `@gedatou/editor/styles.css` = `:root/.dark` oklch token + `@theme inline` 映射（从 `apps/editor/src/index.css` 抽出，去掉 `@fontsource`/app-only 部分）。
- 消费方三行：`@import "tailwindcss";` + `@source ".../node_modules/@gedatou/editor/dist";` + `@import "@gedatou/editor/styles.css";`。
- 遗留：canvas 里未 token 化字面色（`bg-zinc-950/900/800`、选中蓝 `#0B84F3`）——主题化要抽 token，本轮先记着，非阻塞。

## 9. 约束（不可再议，防反复）

React 19 零 `forwardRef`；Tailwind v4 必需；ESM-only；Remotion 单版本 peer；**库内零模块级可变单例**；**库内零直接 `window`/`localStorage`/`fetch('/api')`**（全走注入）；组件只用 Tailwind 工具类 + CSS 变量 token，零硬编码 hex（既有字面色记入遗留）。

## 10. 反跑偏方法论：冻契约 → 一条竖切验证 → 再机械批量

**不要**对着未验证的契约一次性改 30 个文件。顺序：

1. **冻结本文件**（=本步）。
2. **一条竖切验证契约**：建 `packages/editor` 骨架 + `createEditorStore`/`EditorProvider`/`useEditor` + 只改一个小叶子组件（`PlaybackBar`）跑通 → tsup 出包 → `apps/editor` demo 以消费方姿势 import 它 → typecheck + 现有 `verify-m*` e2e 全绿。契约被真实跑通后才继续。
3. **机械批量**：把剩余 ~30 个文件按同一模式转换（`useEditorStore→useEditor`、`getState()→收参`、单例→instanceRefs）。
4. 每步收尾必绿：`pnpm typecheck` + 单测 + `tools/verify-m*.mjs`。

## 11. 分步计划（每步一个 DoD，绿了才进下一步）

1. **`@gedatou/shared`**：改名 + peer + 去 private。DoD：typecheck 绿、shared 单测绿。
2. **`packages/editor` 骨架 + store 契约 + 竖切**（PlaybackBar）。DoD：tsup 出包、demo 消费、typecheck + e2e 绿。
3. **store 批量转换**：`useEditorStore→useEditor`、canvas 单例→`useEditorRefs`、`pendingBase`→闭包。DoD：全 e2e 绿。
4. **注入接口**：`EditorTransport`/`EditorStorage`/`onNotify` + 8 个非组件模块收参 + demo 接默认适配器。DoD：demo 全功能（导入/渲染/字幕/保存）跑通。
5. **打包定稿**：exports 子路径、`styles.css` token 层、`EditorRoot` + 单面板导出、`peerDependencies` 齐。DoD：`npm pack` 产物干净、demo 只靠公开 API 装配。
6. **demo 收尾 + 文档**：`App.tsx` 全改用公开 API；README 写消费方三行 CSS + `<EditorRoot>` 用法。
