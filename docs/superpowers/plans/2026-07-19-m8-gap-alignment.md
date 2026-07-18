# M8 — 对齐官方 editor-starter 功能缺口

依据：官方 features 页全量清单（98 项）× 本地代码审计（2026-07-19）。
已覆盖绝大部分；本里程碑补齐以下缺口，分三个互不重叠的工作块并行实现。

## 块 A：时间线（timeline/**, lib/import-assets.ts）

1. **拖文件到时间线**（FEATURE_DROP_ASSETS_ON_TIMELINE）：OS 文件拖到轨道区，
   按落点帧位置与轨道创建素材项；有拖放高亮指示。
2. **最大裁剪指示器**（FEATURE_MAX_TRIM_INDICATORS）：拖伸缩手柄时显示底层媒体
   可延伸的最大范围（考虑 trimBefore 与 playbackRate）。
3. **时间线音量线**（FEATURE_TIMELINE_VOLUME_CONTROL）：音/视频块上可上下拖动的
   水平音量线，拖动中显示数值，commit:false 合并撤销。
4. **淡入淡出手柄**（FEATURE_AUDIO_FADE_CONTROL / FEATURE_VISUAL_FADE_CONTROL）：
   块顶部两角圆点，水平拖动设置 fadeIn/fadeOut 秒数，绘制淡变遮罩区。
5. **视频块音频波形**（FEATURE_AUDIO_WAVEFORM_FOR_VIDEO_ITEM）：有音轨的视频块
   底部显示波形，复用现有 Waveform 峰值管线。

## 块 B：检查器与媒体细节（inspector/**, lib/probe.ts, lib/captioning.ts, lib/extract-audio.ts, store.ts）

1. **源信息**（Source info）：选中素材项显示文件名、大小、类型、时长/尺寸、上传状态。
2. **裁剪数值控件**：Inspector 中 crop x/y/w/h 数字输入，钳制在媒体边界内。
3. **字体样式悬停预览**（FEATURE_CHANGE_FONT_STYLE_ON_HOVER）：悬停字重/斜体选项
   时画布实时预览。
4. **字体下拉自身字体渲染**（FEATURE_FONT_FAMILY_DROPDOWN_RENDER_IN_FONT）：
   可见行懒加载字体样式表并用该字体渲染。
5. **GIF 内在时长**：用 @remotion/gif 的 getGifDurationInSeconds 替换硬编码 3s。
6. **字幕时间修正**：转写对裁剪/倍速后的源正确对齐（抽取裁剪段或重映射 token 时间），
   附单元测试。

## 块 C：画布（canvas/**, App.tsx, lib/add-items.ts）

1. **拖拽绘制 Solid**（FEATURE_DRAW_SOLID_TOOL）：工具按钮进入绘制模式，十字光标，
   拖出矩形创建 solid；单击给默认尺寸；Esc 取消。
2. **捏合缩放**：ctrlKey 滚轮（触控板捏合）与 Cmd+滚轮同样触发画布缩放。

## 明确不做（官方也没有）

素材库面板、画布旋转手柄、fps 控件、轨道重命名/手动排序 —— 均不在官方功能清单。

## 验证

- `pnpm typecheck` + 现有 vitest 全绿。
- Playwright（tools/verify-*.mjs）覆盖新交互的关键路径。
- 完成后按 AG 规范分块提交。

## 后续里程碑

M9：shadcn UI 打磨（图标、tooltip、对话框、右键菜单、toast 错误反馈）。
