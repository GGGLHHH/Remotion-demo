# Remotion Editor

功能对齐 [editor-starter.remotion.dev](https://editor-starter.remotion.dev/) 的自研网页视频编辑器。商用产品打底，代码完全自有。

## 架构

```
packages/shared    数据模型 + Remotion 合成组件（编辑器预览与服务端渲染共用同一棵组件树）
apps/editor        Vite + React 19 + Zustand + Tailwind 4 编辑器 SPA
apps/server        Fastify：预签名上传 / 渲染队列(@remotion/renderer) / whisper.cpp 转录
```

后端路由对齐官方：`POST /api/upload`、`POST /api/render`、`POST /api/progress`、`POST /api/captions`、`POST /api/delete-asset`。

## 启动

```bash
docker compose up -d minio    # MinIO（S3 兼容，9100/9101，minioadmin/minioadmin）
pnpm install
pnpm -F server dev            # 后端 :3001
pnpm dev                      # 编辑器 :5173（/api 代理到 3001）
```

环境变量（均有开发默认值）：`S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET / S3_PUBLIC_BASE_URL / PORT / WHISPER_MODEL`（生产中文字幕建议 `WHISPER_MODEL=medium`；生产存储可无缝切阿里云 OSS/腾讯 COS 等 S3 兼容服务）。

## 功能

- **画布**：选择/多选/框选、拖拽（Shift 锁轴）、8 向手柄缩放（角等比）、旋转、吸附辅助线、右键置顶/置底、双击文本行内编辑、双击视频/图片进裁剪模式、文件拖放导入、缩放（Cmd+滚轮 / ± / 0 适配）
- **时间轴**：多轨道、播放头、跨轨拖动（拖出边缘新建轨道）、修剪（含素材上限钳制）、S 分割、Alt 滚动编辑、框选、轨道隐藏/静音、吸附（Shift+M）、缩放滑杆、面板高度拖拽、视频胶片缩略图、音频波形
- **Inspector**：合成设置/渲染入口；通用变换 + 淡入淡出 + 对齐工具；文本全量（Google Fonts 选择器 + 悬停预览、字重、描边、行高字距、RTL、文字背景）；媒体（0.25–5x 变速联动时长、音量 dB、静音）；字幕（逐词修正、词级时间、页时长、行数、高亮色）
- **素材**：MinIO 预签名上传 + IndexedDB 本地缓存（预览优先 blob）+ 两阶段删除清理
- **持久化**：手动保存（Cmd+S）到 localStorage、工程 JSON 下载/导入、`#state=<base64>` URL 加载
- **导出**：服务端 `@remotion/renderer` 渲染队列（MP4/WebM），进度轮询，产物传 MinIO 供下载
- **字幕**：whisper.cpp 词级转录 → TikTok 式分页 + 当前词高亮
- **撤销/重做**：快照式（上限 50），高频拖拽松手才入栈

## 测试

```bash
pnpm typecheck && pnpm test          # 类型 + 单测（时间轴 ops / 撤销重做 / 几何）
node tools/verify-m5.mjs             # e2e：持久化/播放条/素材清理（需 dev server 运行）
node tools/verify-m6.mjs             # e2e：真实渲染导出
node tools/verify-m7.mjs             # e2e：真实转录出字幕
```

## 已知边界（与官方 starter 一致，刻意不做）

关键帧动画、转场、多项目管理、自动保存、移动端、多帧率（固定 30fps）、账号体系、浅色主题。另：Google Fonts 加载依赖其 CDN（国内生产建议镜像域名）。
