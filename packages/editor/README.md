# @gedatou/editor

一个可嵌入的 Remotion 视频编辑器 React 组件库——时间线、画布、检查器、播放条一站式，或用 `Editor.*` 零件（shadcn-compound）自拼工具栏与布局。组件按 [shadcn](https://ui.shadcn.com) 官方写法编写（base-ui + `cva` + `data-slot` + CSS 变量 token），主题可换肤。

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

换肤：在你的 `:root` / `.dark` 里覆盖 `--primary`、`--background`、`--card`、`--border` 等 token 即可——外壳、工具栏、时间线、画布全部走 token，不再有硬编码颜色。

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

## 自定义工具栏 / 布局（compound）

`EditorRoot` 就是用一组 `Editor.*` 零件拼出来的 preset。想换标题、增删工具栏按钮、改布局时，用**同样的零件**自己拼即可。零件都是 context-connected——放进 `<EditorProvider>` 里摆放即用，**无需给它们传任何函数**（各自从 context 取 store/deps/refs）：

```tsx
import { EditorProvider, Editor, useEditor } from "@gedatou/editor";

function MyEditor({ deps }) {
  return (
    <EditorProvider deps={deps}>
      <Editor.Container>
        <Editor.Toolbar>
          <Editor.Title>我的剪辑器</Editor.Title>
          <Editor.UndoButton />
          <Editor.RedoButton />
          <Editor.ImportAssetButton />
          <div className="ml-auto flex gap-2">
            <MyPublishButton />        {/* 你自己的按钮：内部用 useEditor 取态 */}
            <Editor.SaveButton />
            {/* 不渲染 DownloadStateButton/ImportStateButton = 天然删掉 */}
          </div>
        </Editor.Toolbar>
        <div className="flex min-h-0 flex-1">
          <Editor.Canvas />
          <Editor.Inspector className="w-80" />
        </div>
        <Editor.PlaybackBar />
        <Editor.Timeline />
      </Editor.Container>
    </EditorProvider>
  );
}
```

- `Editor.Container` 内部会接上快捷键 + Esc 退画布工具 + 上传/渲染/转录未完成时拦刷新。自绘外壳（不用 `Container`）时，在 Provider 内手动调 `useEditorChrome()` 接回这些行为。
- 面板 `Editor.Canvas` / `Inspector` / `Timeline` / `PlaybackBar` 都接受 `className`（宿主控宽/改样式）。
- 全部 `Editor.*` 零件见下方[导出一览](#导出一览)。

### 更底层：裸面板 + 自绘外壳

只要面板、完全自绘外壳时，用扁平导出的面板 + hooks（`Editor.*` 也是它们的别名）：

```tsx
import {
  EditorProvider, Canvas, Inspector, PlaybackBar, Timeline, useEditorChrome,
} from "@gedatou/editor";

function Shell() {
  useEditorChrome();                 // 必须在 Provider 内：快捷键 / Esc 退工具 / 拦刷新
  return (
    <>
      <MyToolbar />
      <div className="flex"><Canvas /><Inspector /></div>
      <PlaybackBar />
      <Timeline />
    </>
  );
}

function Editor({ deps }) {
  return <EditorProvider deps={deps}><Shell /></EditorProvider>;
}
```

`useEditor(selector)` / `useEditorApi()` / `useEditorRefs()` / `useEditorDeps()` 在 Provider 内可取到每实例的 store、裸 store 句柄、player/pan 等 refs、注入依赖。自定义按钮就靠它们取态、调 store action 或[命令式操作](#导出一览)。

## 导出一览

- 一站式：`EditorRoot`（preset）
- 面板（均接受 `className`）：`Canvas`、`Timeline`、`Inspector`、`PlaybackBar`
- Compound 零件（`Editor.*` 命名空间）：
  - 布局：`Container`、`Toolbar`、`Title`
  - 按钮：`UndoButton`、`RedoButton`、`PlayButton`、`TextToolButton`、`SolidToolButton`、`ImportAssetButton`、`ZoomControls`、`SaveButton`、`CleanupAssetsButton`、`DownloadStateButton`、`ImportStateButton`
  - 徽章：`UploadStatusBadge`、`CaptioningBadge`
  - （`Container` 与四个面板同时也是扁平导出：`EditorContainer`、`Canvas`…）
- Provider / hooks：`EditorProvider`、`useEditor`、`useEditorApi`、`useEditorRefs`、`useEditorDeps`、`useShortcuts`、`useEditorChrome`
- 工厂：`createEditorStore`、`createInstanceRefs`
- 命令式操作：`importFiles`、`startRender`、`generateCaptions`、`cleanupDeletedAssets`、`saveState`、`loadStateFromFile`、`downloadStateFile`、`restoreLocalUrls`
- 适配器（`@gedatou/editor/adapters`）：`createHttpTransport`、`createBrowserStorage`
- 类型：`EditorTransport`、`EditorStorage`、`NotifyFn`、`EditorDeps`、`EditorStore`、`EditorStoreApi`、`EditorInitialState`、`EditorInstanceRefs`、`RenderProgress`、`EditorRootProps`、`CanvasTool`

## 已知限制

- RSC：产物暂未逐文件保留 `"use client"`；在 Next.js App Router 里请于你的 import 边界处标注 client（编辑器全为交互组件）。
- 仅 ESM。
