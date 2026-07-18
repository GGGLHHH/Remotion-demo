# Remotion 视频编辑器设计文档

日期：2026-07-19
状态：已获用户批准（对话中逐节确认）
目标：功能对等复刻 https://editor-starter.remotion.dev/ ，作为商用产品的基础代码。

## 1. 背景与决策

| 决策点 | 结论 |
|--------|------|
| 项目目的 | 商用产品打底，代码完全自有 |
| 实现路线 | 自研复刻（不购买官方 starter、不基于开源项目改造） |
| 渲染后端 | 自建渲染服务：Node + `@remotion/renderer`，参考官方 template-render-server |
| 字幕转录 | 服务器跑 whisper.cpp（`@remotion/install-whisper-cpp`），默认 medium 模型 |
| 前端栈 | Vite + React + TypeScript + Tailwind + Zustand |
| 素材存储 | S3 兼容协议：本地开发 Docker MinIO，生产可切阿里云 OSS/腾讯 COS/AWS S3 |
| UI 复刻度 | 功能与交互对等即可，视觉风格自定（深色专业编辑器风），不追求像素级 1:1 |

## 2. 总体架构

```
remotion-editor/                    pnpm monorepo
├─ packages/shared/                 核心：双端共用
│   ├─ types.ts                     数据模型（Track/Item/Asset 联合类型）
│   └─ composition/                 Remotion 合成组件（MainComposition）
│       └─ items/                   每种 Item 的渲染组件
├─ apps/editor/                     Vite + React SPA（纯前端）
│   ├─ state/                       Zustand store + 撤销/重做
│   ├─ canvas/                      画布交互层（覆盖在 <Player> 之上）
│   ├─ timeline/                    时间轴
│   ├─ inspector/                   右侧属性面板
│   ├─ playback/                    播放控制条
│   ├─ shortcuts/                   集中式 keymap
│   └─ persistence/                 localStorage / IndexedDB / URL hash
└─ apps/server/                     Node (Fastify) 后端
    ├─ POST /api/upload             签发 MinIO/S3 预签名上传 URL
    ├─ POST /api/render             入队渲染任务 → @remotion/renderer
    ├─ POST /api/progress           查询渲染进度
    ├─ POST /api/captions           音频 → whisper.cpp → Caption[]
    └─ GET  /api/font/:name         Google Fonts 元数据按需下发
```

**核心原则**：预览与导出是同一棵 React 组件树。`<Player>` 在浏览器渲染 `MainComposition`，服务端 `renderMedia()` 渲染同一组件，输入同为序列化的 `undoableState`。合成组件必须放在 `shared`，这保证所见即所得。

与官方 starter 的架构差异（3 处，均为用户确认的选择）：
1. React Router 7 → Vite SPA；
2. AWS Lambda 渲染 → 自建渲染服务（render/progress 模式保持一致）；
3. OpenAI Whisper API → 服务器 whisper.cpp。

后端 5 路由与官方 starter 完全对齐，方便日后对照官方文档演进。

## 3. 数据模型（1:1 对齐官方）

三实体：

- **Asset**（素材）：`ImageAsset | VideoAsset | GifAsset | AudioAsset | CaptionAsset`。上传状态机：`pending-upload → in-progress → uploaded / error`。
- **Item**（时间轴条目，画布上可见/可听的实例）：`ImageItem | VideoItem | GifItem | TextItem | SolidItem | AudioItem | CaptionsItem`（7 种）。
- **Track**（轨道）：包含多个 Item，可混类型；轨道纵向堆叠，上方轨道渲染在前（z-order）。

关系约束：
- Item 属于唯一 Track；同一 Track 内 Item 时间区间不重叠；
- Item 至多引用 1 个 Asset；多个 Item 可共享同一 Asset；
- Text/Solid Item 无 Asset。

## 4. 状态管理

状态分两层（官方同款，撤销/重做正确性的前提）：

- **`undoableState`**（进撤销栈、进持久化）：`tracks`、`items`、`assets`、`fps`（固定 30，`DEFAULT_FPS` 常量）、`compositionWidth/Height`、`deletedAssets`。
- **瞬时状态**（不进撤销栈）：`selectedItems`、`textItemEditing`、`itemSelectedForCrop`、`renderingTasks`、`captioningTasks`、`itemsBeingTrimmed`、`loop`、`assetStatus`。

撤销/重做：
- `undoableState` 快照数组，上限 50；
- 更新携带 `commitToUndoStack` 标记；拖拽、修剪、滑杆等高频操作仅在交互结束（松手）时提交一次快照；
- 值未变化时不产生新快照（引用比较）。

状态库用 Zustand（选择器订阅解决官方用多层 Context 解决的重渲染问题）；提供等价于官方 `useCurrentStateAsRef()` 的命令式读取途径（`store.getState()`）。

## 5. 前端交互模块

### 5.1 画布（Canvas）

`<Player>` 上覆盖交互层；合成坐标与屏幕坐标只差一个缩放变换，交互全部在覆盖层处理。

功能：点选（蓝色描边）/框选/多选（Cmd/Shift+点击）、拖动（Shift 锁轴）、四角八向缩放手柄（Shift 可解除宽高比锁定，默认关闭）、旋转（含 90° 快捷按钮）、对齐吸附辅助线、右键菜单置顶/置底、复制/粘贴（含粘贴文本为文本 Item、粘贴图片素材）、文件从文件系统拖放到画布（按落点与当前时间创建 Item）、双击进入裁剪模式（半透明显示未裁剪原图，Inspector 同步显示裁剪值）、文本双击行内编辑。

画布缩放：Cmd/Ctrl+滚轮、触控板捏合、`+`/`-`/`0` 快捷键、百分比显示、适配空间重置。

### 5.2 时间轴（Timeline）

- 可拖动播放头，播放时自动跟随；
- Item 条块跨轨道/跨时间拖动，多选联动；
- 两端修剪手柄，显示素材最大可修剪位置；
- 播放头处分割（split）；相邻 Item 滚动编辑（rolling edit）；
- 框选（marquee）批量选择；轨道隐藏/静音；
- 吸附开关（Shift+M）；时间轴缩放滑杆；面板高度可拖拽调整；
- 视频胶片缩略图：`<video>` seek + canvas 抽帧，懒加载；
- 音频波形：AudioContext 解码取峰值绘制；
- 淡入/淡出手柄：同时作用于不透明度与音量；
- 素材拖入自动按其时长创建 Item。

### 5.3 Inspector（右侧属性面板）

未选中：合成设置（宽高、交换尺寸按钮、渲染入口）。选中时按 Item 类型分发：

- 通用：X/Y、宽高、裁剪值、宽高比锁定、圆角、不透明度、旋转、图层对齐工具、素材来源信息；
- 文本：字体选择器（下拉项用自身字体渲染 + 悬停画布实时预览）、字重/样式变体、字号、颜色、描边宽度/颜色、行高（0.5–5.0）、字间距（−10px~50px）、对齐（左/中/右）、文字方向 LTR/RTL 自动检测、文字背景色/内边距/背景圆角、自适应高度的内容输入框；
- 媒体（视频/音频/GIF）：播放速度 0.25x–5x（自动调整时长）、音量滑杆（dB 显示）、淡入/淡出时长；
- 字幕：逐词修正、词级时间调整、页时长、最大行数、高亮色；
- 颜色选择器用于文本/纯色/字幕。

### 5.4 播放控制条

播放/暂停（空格）、`MM:SS.FF` 时间码、跳到头/尾、全屏（Esc 退出）、全局静音、循环开关。

### 5.5 快捷键（集中 keymap 模块）

撤销 Cmd/Ctrl+Z、重做 Cmd/Ctrl+Y 与 Cmd/Ctrl+Shift+Z、剪切/复制/粘贴 X/C/V、复制体 Cmd/Ctrl+D、保存 Cmd/Ctrl+S、全选、删除、逐帧移动、画布缩放 `+`/`-`/`0`、吸附切换 Shift+M、空格播放。

## 6. 后端服务

### 6.1 上传（POST /api/upload）

S3 SDK 对 MinIO 签发预签名 PUT；`MAX_FILE_UPLOAD_SIZE_IN_MB` 常量限制大小（默认 1000）。素材删除两阶段：先进 `undoableState.deletedAssets` 暂存（撤销栈可能仍引用），清理时（需先清撤销栈）删 MinIO 对象与 IndexedDB 缓存，仅删 `assetStatus === 'uploaded'` 的远端对象。

### 6.2 渲染（POST /api/render + /api/progress）

- 服务启动时对 shared 合成 `bundle()` 一次；
- 渲染请求：序列化 `undoableState` 作为 `inputProps` 入队；
- 单 worker 内存队列逐个 `renderMedia()`（ponytail: 单机内存队列，并发/分布式需求出现时再换 BullMQ+Redis）；
- `onProgress` 写入任务表，`/api/progress` 轮询返回；
- 编码：MP4(H.264) / WebM 可选；
- 成品上传 MinIO，返回预签名下载 URL；
- 前端：渲染按钮 + 进度指示 + 完成下载；长任务进行中离开页面弹窗拦截。

### 6.3 字幕（POST /api/captions）

- 前端抽出音轨（转录时长上限常量 `MAX_DURATION_ALLOWING_CAPTIONING_IN_SEC` 前置校验）；
- 上传音频 → whisper.cpp 词级时间戳转录（模型可配置，默认 medium，兼顾中文效果）；
- 返回 `@remotion/captions` 的 `Caption[]`；
- 前端 `createTikTokStyleCaptions` 分页，生成 `CaptionsItem` 入时间轴；
- 播放时按词时间高亮当前词。

### 6.4 字体（GET /api/font/:name）

构建脚本预生成 Top 250 Google Fonts 元数据（避免 10MB 打进前端包），按需下发；合成组件用 `@remotion/google-fonts` 加载，预览与导出一致。字体下拉每项用仅含所需字符的子集字体文件渲染。

## 7. 持久化

- 手动保存（按钮 + Cmd/Ctrl+S）→ localStorage 版本化 key（如 `remotion-editor-state-v1`），仅持久化 `undoableState`；回访自动加载；
- 状态下载为 JSON 文件 / 从文件导入；
- `#state=<base64>` URL hash 加载初始状态；
- 素材 IndexedDB 缓存：远端素材下载后缓存，展示优先用本地 blob URL。

## 8. 范围边界（明确不做，与官方对齐）

关键帧动画、转场（后续可用 `@remotion/transitions`）、多项目管理、自动保存（仅手动）、移动端、多帧率（fps 固定 30）、用户账号/鉴权、浅色主题、自定义（非 Google）字体。均有后续升级路径，本期不实现。

## 9. 里程碑（每个结束时可运行、可演示）

| # | 内容 | 验收标志 |
|---|------|---------|
| M0 | Monorepo 脚手架 + shared 数据模型 + 合成骨架 | Player 能播含文本/色块的合成 |
| M1 | 状态层（Zustand+撤销重做）+ 画布选择/拖拽/缩放 + Inspector 通用属性 | 画布摆放、变换元素，可撤销 |
| M2 | 时间轴核心：轨道/条块/播放头/跨轨拖动/修剪/分割/吸附/框选/缩放 | 完整时间轴编辑体验 |
| M3 | 素材管线：MinIO 上传 + IndexedDB 缓存 + 拖放导入 + 胶片缩略图 + 波形 | 拖入视频即可编辑 |
| M4 | 文本/字体系统 + Inspector 全量（裁剪/旋转/速度/音量/淡入淡出） | 属性面板对齐官方 |
| M5 | 持久化 + 全套快捷键 + 播放控制条完善 | 刷新不丢工程 |
| M6 | 渲染服务：bundle + 队列 + 进度 + 成品下载 | 一键导出 MP4 |
| M7 | 字幕：whisper.cpp 转录 + CaptionsItem + 字幕面板 | 一键出词级高亮字幕 |

## 10. 错误处理与测试

错误处理：
- 上传失败标 `error` 状态、可重试；
- 渲染失败在任务面板展示错误摘要；
- 转录前置校验时长/大小；
- 长任务中离开页面 beforeunload 拦截。

测试：
- Vitest 单测覆盖纯逻辑：撤销/重做、吸附计算、轨道重叠检测、修剪边界、变速时长换算、rolling edit 边界；
- Playwright 一条端到端冒烟：导入素材 → 时间轴编辑 → 触发渲染；
- 渲染服务：2 秒测试合成的集成测试；
- 不做大规模 UI 快照测试。
