# @gedatou/editor

一个可嵌入的 **headless 视频编辑器引擎**（Remotion）——核心是状态 + 命令 + 钩子 + 画布/时间线/检查器等交互面，**由你在其上自建 UI**；不锁定文案、配色、布局。也自带一套可选的 batteries-included 外壳（`EditorRoot` / `Editor.*`），要开箱即用直接放进去即可。组件按 [shadcn](https://ui.shadcn.com) 官方写法编写（base-ui + `cva` + `data-slot` + CSS 变量 token），主题可换肤。

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

换肤：在你的 `:root` / `.dark` 里覆盖 `--primary`、`--background`、`--card`、`--border` 等 token 即可。

## 核心（headless）—— 自建 UI

主用法：`EditorProvider` 提供每实例的 store/refs/deps；`useEditor(selector)` 读响应式状态、
`useEditorCommands()` 取一套绑好的命令、再配合 `Canvas` / `Timeline` / `Inspector` / `PlaybackBar`
这些交互面，**自建任意工具栏 / 菜单 / 快捷键 / 布局**（文案、配色、语言全归你）：

```tsx
import {
  EditorProvider, useEditor, useEditorCommands, useEditorChrome,
  Canvas, Timeline, Inspector, PlaybackBar,
} from "@gedatou/editor";

// 你自己的工具栏：命令来自 useEditorCommands，状态来自 useEditor —— 文案/样式都归你
function Toolbar() {
  const cmd = useEditorCommands();
  const canUndo = useEditor((s) => s.past.length > 0);
  const dirty = useEditor((s) => s.undoable !== s.lastSavedState);
  return (
    <header className="flex items-center gap-2">
      <button disabled={!canUndo} onClick={cmd.undo}>Undo</button>
      <button onClick={cmd.togglePlay}>Play/Pause</button>
      <button onClick={() => cmd.setTool("text")}>Text</button>
      <input type="file" multiple onChange={(e) => cmd.importAssets([...(e.target.files ?? [])])} />
      <button onClick={cmd.save}>Save{dirty ? " •" : ""}</button>
      <button onClick={() => cmd.render("mp4")}>Render</button>
    </header>
  );
}

function Shell() {
  useEditorChrome(); // 快捷键 + Esc 退画布工具 + 上传/渲染未完成拦刷新（自绘外壳时手动接回）
  return (
    <div className="flex h-screen flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <Canvas />
        <aside className="w-[349px] overflow-y-auto border-l"><Inspector /></aside>
      </div>
      <PlaybackBar />
      <Timeline />
    </div>
  );
}

export function MyEditor({ deps }: { deps: EditorDeps }) {
  return (
    <EditorProvider deps={deps}>
      <Shell />
    </EditorProvider>
  );
}
```

- **`useEditorCommands()`**（`EditorCommands`）：`undo`/`redo`、`togglePlay`/`play`/`pause`/`seekTo`、
  `addText`/`addSolid`/`importAssets`、`copy`/`cut`/`paste`/`duplicate`/`deleteSelected`/`selectAll`、
  `bringToFront`/`sendToBack`/`splitAtPlayhead`/`toggleSnapping`、`setTool`、`setZoom`/`zoomIn`/`zoomOut`/`fitZoom`、
  `save`/`downloadState`/`loadState`/`cleanupAssets`/`render`。命令在调用时读最新状态，返回对象引用稳定。
- **`useEditor(selector)`**：读响应式状态（`s.past.length`/`s.future.length`、`s.undoable !== s.lastSavedState`、
  `s.selectedItemIds`、`s.canvasZoom`、`s.snappingEnabled`、`s.renderingTasks`、`s.assetStatus` …）。
- **交互面组件**：`Canvas` / `Timeline` / `Inspector` / `PlaybackBar` —— 这些是库的重头（画布拖拽/缩放/裁剪、
  时间线 trim/吸附/框选、检查器字段），通常直接用；想自绘也可基于 `useEditorApi().updateUndoable(...)` 自建。
- `useEditorApi()` / `useEditorRefs()`：拿裸 store 句柄与 player/pan 等 refs（性能敏感/命令未覆盖的场景）。

## 注入后端 / 存储 / 提示 / 文本（deps）

编辑器不写死任何后端、也不做 i18n。这些 app 关注点全部注入（有默认适配器）：

```ts
type EditorDeps = {
  transport: EditorTransport; // 服务端 I/O（默认 createHttpTransport 打同源 /api）
  storage: EditorStorage;     // 持久化 + 素材缓存（默认 createBrowserStorage）
  notify: NotifyFn;           // 用户提示（默认 sonner；(msg, level) => void）
  t?: EditorT;                // 文本解析器（可选）：不传用库内置 zh 默认，见下
};
```

后端契约见默认适配器实现（`@gedatou/editor/adapters` 源码）：`/api/upload`（签名+PUT）、`/api/render`、
`/api/progress`、`/api/captions`、`/api/delete-asset`。

### i18n：库不做 i18n，只留注入缝

库本身不切语言、不带多语言、不引 i18n 依赖——把「文本」当作又一个 app 关注点外包：库文案写成
`t('key')`，内置一套 **zh 默认字典**（`zhMessages`，也是完整 key 目录）。消费方注入自己的
`deps.t`（如接了 react-i18next 的宿主）即可让编辑器跟随宿主语言，**库一行不用改**：

```ts
import { zhMessages, type EditorT } from "@gedatou/editor";
// zhMessages 是完整 key 清单 + zh 源文案，拿它当翻译基线。
const t: EditorT = (key, params) => myI18n.exists(`editor.${key}`)
  ? myI18n.t(`editor.${key}`, params)   // 命中你的翻译
  : key;                                 // 未命中 → 返回 key → 库回落内置 zh 默认
```

不注入 `t` 时全部走内置 zh 默认（standalone / demo 即中文）。

## 可选：batteries-included 外壳（EditorRoot / Editor.*）

不想自建 chrome 时，用现成的一站式外壳（它本身就是用下面的 `Editor.*` 零件拼出来的 preset）：

```tsx
import { EditorRoot } from "@gedatou/editor";
export default () => <EditorRoot deps={deps} />;
```

想改工具栏/布局但又不想全headless，用 `Editor.*` compound 零件（context-connected，摆放即用）自拼：

```tsx
import { EditorProvider, EditorContainer, Editor, Canvas, Inspector, Timeline, PlaybackBar } from "@gedatou/editor";

<EditorProvider deps={deps}>
  <EditorContainer>
    <Editor.Toolbar>
      <Editor.Title>我的剪辑器</Editor.Title>
      <Editor.UndoButton /><Editor.RedoButton /><Editor.ImportAssetButton />
      <div className="ml-auto flex gap-2"><MyButton /><Editor.SaveButton /></div>
    </Editor.Toolbar>
    <div className="flex min-h-0 flex-1">
      <Canvas />
      <Inspector className="w-80" />
    </div>
    <PlaybackBar />
    <Timeline />
  </EditorContainer>
</EditorProvider>
```

> `Editor.*` 只含 chrome（工具栏容器/标题/按钮/徽章）；交互面用扁平的 `Canvas`/`Timeline`/`Inspector`/`PlaybackBar`
> （均接受 `className`），外壳用 `EditorContainer`（内含 `TooltipProvider` + 快捷键/拦刷新）。
> 这些具体 chrome 有内置文案（走 `deps.t` / 内置 zh）与默认样式；要完全掌控就走上面的 headless 核心。

## 导出一览

- **headless 核心**：`EditorProvider`、`useEditor`、`useEditorApi`、`useEditorRefs`、`useEditorDeps`、
  `useEditorCommands`、`useEditorChrome`、`useShortcuts`；`createEditorStore`、`createInstanceRefs`
- **交互面组件**：`Canvas`、`Timeline`、`Inspector`、`PlaybackBar`（均接受 `className`）
- **外壳 / 可选 chrome**：`EditorContainer`、`TooltipProvider`、`EditorRoot`（preset）、
  `Editor.*` 命名空间（`Toolbar`/`Title` + 各工具栏按钮 + 徽章，仅 chrome）
- **命令式操作**：`importFiles`、`startRender`、`generateCaptions`、`cleanupDeletedAssets`、
  `saveState`、`loadStateFromFile`、`downloadStateFile`、`restoreLocalUrls`、`serializeState`、`deserializeState`
- **i18n**：`zhMessages`（zh 默认 + key 目录）
- **类型**：`EditorCommands`、`EditorTransport`、`EditorStorage`、`NotifyFn`、`EditorDeps`、`EditorT`、
  `EditorStore`、`EditorStoreApi`、`EditorInitialState`、`EditorInstanceRefs`、`RenderProgress`、
  `EditorRootProps`、`CanvasTool`

## 已知限制

- RSC：产物暂未逐文件保留 `"use client"`；在 Next.js App Router 里请于你的 import 边界处标注 client（编辑器全为交互组件）。
- 仅 ESM。
