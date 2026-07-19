# @gedatou/editor

一个可嵌入的 Remotion 视频编辑器 React 组件库——时间线、画布、检查器、播放条一站式，或拆成单面板自定义布局。组件按 [shadcn](https://ui.shadcn.com) 官方写法编写（base-ui + `cva` + `data-slot` + CSS 变量 token），主题可换肤。

> 要求：**React 19** · **Tailwind CSS v4** · Remotion 4.0.491。

## 安装

```bash
npm install @gedatou/editor @gedatou/shared
# peer 依赖（宿主提供，版本需对齐；Remotion 全家必须单版本）
npm install react react-dom @base-ui/react lucide-react zustand mediabunny \
  remotion@4.0.491 @remotion/player@4.0.491 @remotion/media@4.0.491 \
  @remotion/gif@4.0.491 @remotion/google-fonts@4.0.491 @remotion/captions@4.0.491
```

## CSS（Tailwind v4，策略：发源码）

组件是 Tailwind class 字符串——由**你自己的 Tailwind 编译器**扫描本包生成工具类。在你的入口 CSS 里：

```css
@import "tailwindcss";
/* 让 Tailwind 扫描本包，生成组件用到的工具类 */
@source "../node_modules/@gedatou/editor/dist";
/* 本包的 oklch 主题 token（换肤只需重定义下面变量，无需碰组件） */
@import "@gedatou/editor/styles.css";
```

换肤：在你的 `:root` / `.dark` 里覆盖 `--primary`、`--background` 等 token 即可。

## 快速开始

`EditorRoot` 自带 store/refs 隔离与 Provider，放进去 + 注入 I/O 依赖即可运行（一页可多个实例）：

```tsx
import { EditorRoot, type EditorDeps } from "@gedatou/editor";
import { createHttpTransport, createBrowserStorage } from "@gedatou/editor/adapters";

const deps: EditorDeps = {
  transport: createHttpTransport({ baseUrl: "/api" }), // 指向你的后端
  storage: createBrowserStorage(),                     // localStorage + IndexedDB
  notify: (msg, level) => myToast(msg, level),         // 接你自己的提示系统
};

export default function App() {
  return <EditorRoot deps={deps} />;
}
```

## 注入你的后端 / 存储 / 提示

编辑器不写死任何后端。三个接口全部由你实现（或用默认适配器）：

```ts
interface EditorTransport {          // 服务端 I/O（默认 createHttpTransport 打同源 /api）
  uploadAsset(file, opts?): Promise<{ url: string }>;
  deleteRemoteAsset(url): Promise<void>;
  startRender({ state, codec }): Promise<{ taskId: string }>;
  renderProgress(taskId): Promise<RenderProgress>;
  generateCaptions(wav): Promise<{ captions: Caption[] }>;
}
interface EditorStorage {            // 持久化 + 素材缓存（默认 createBrowserStorage）
  loadProject(): UndoableState | null | Promise<…>;
  saveProject(state): void | Promise<void>;
  getAsset(id) / putAsset(id, blob) / deleteAsset(id);
}
type NotifyFn = (message: string, level?: "info" | "success" | "error") => void;
```

后端契约见默认适配器实现（`@gedatou/editor/adapters` 源码）：`/api/upload`（签名+PUT）、`/api/render`、`/api/progress`、`/api/captions`、`/api/delete-asset`。

## 自定义布局（单面板）

不想用一站式外壳时，用 `EditorProvider` 包住自选面板：

```tsx
import {
  EditorProvider, Canvas, Timeline, Inspector, PlaybackBar, useShortcuts,
} from "@gedatou/editor";

function Editor({ deps }) {
  return (
    <EditorProvider deps={deps}>
      <MyToolbar />
      <div className="flex">
        <Canvas tool={null} onExitTool={() => {}} />
        <Inspector />
      </div>
      <PlaybackBar />
      <Timeline />
    </EditorProvider>
  );
}
```

`useEditor(selector)` / `useEditorApi()` / `useEditorRefs()` / `useEditorDeps()` 在 Provider 内可取到每实例的 store、裸 store 句柄、player/pan 等 refs、注入依赖。

## 导出一览

- 组件：`EditorRoot`、`Canvas`、`Timeline`、`Inspector`、`PlaybackBar`
- Provider / hooks：`EditorProvider`、`useEditor`、`useEditorApi`、`useEditorRefs`、`useEditorDeps`、`useShortcuts`
- 工厂：`createEditorStore`、`createInstanceRefs`
- 命令式操作：`importFiles`、`startRender`、`generateCaptions`、`cleanupDeletedAssets`、`saveState`、`loadStateFromFile`、`downloadStateFile`、`restoreLocalUrls`
- 适配器（`@gedatou/editor/adapters`）：`createHttpTransport`、`createBrowserStorage`
- 类型：`EditorTransport`、`EditorStorage`、`NotifyFn`、`EditorDeps`、`EditorStore`、`EditorStoreApi`、`EditorInitialState`、`EditorInstanceRefs`、`RenderProgress`、`EditorRootProps`

## 已知限制

- RSC：产物暂未逐文件保留 `"use client"`；在 Next.js App Router 里请于你的 import 边界处标注 client（编辑器全为交互组件）。
- 仅 ESM。
