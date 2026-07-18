# M4：文本/字体系统 + Inspector 全量 + 画布补全 实施计划

> REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** 文本面板全量（字体选择器 + 悬停预览）、媒体面板（变速/音量/淡入淡出）、裁剪模式、画布补全（框选/吸附辅助线/右键菜单/剪贴板/对齐工具/行内编辑）。

**规格来源:** specs §5.1 §5.3、M4 验收

## Tasks

1. **T1 字体系统**：`@remotion/google-fonts` 的 `getAvailableFonts()` 提供列表与懒加载；`shared/composition/fonts.ts` 的 `ensureFontLoaded(family)`（TextItemRenderer 内 useEffect 调用，渲染端同样生效）；编辑器 `inspector/FontPicker.tsx`：搜索 + 下拉（每项以自身字体渲染）+ 悬停实时预览（改瞬时 `textItemHoverPreview`，合成读取覆盖）+ 字重/斜体变体。ponytail: 中国网络下 Google CDN 需代理，生产可换镜像域名。
2. **T2 文本面板全量**：字号/颜色/描边/行高(0.5–5)/字间距(−10–50)/对齐/RTL 自动检测(输入时按首个强方向字符)/背景色+内边距+圆角/自适应 textarea；画布双击文本 → 行内编辑（contentEditable 覆盖层，Esc/失焦提交）。
3. **T3 媒体面板**：播放速度 0.25–5（改变时长同步换算，撤销一条）、音量滑杆（dB 显示：20·log10(v)）、静音开关、淡入/淡出时长（秒输入，存帧）；时间轴条块淡入淡出三角指示。
4. **T4 裁剪模式**：双击视频/图片 → `itemSelectedForCrop`（瞬时）；画布显示全图半透明 + 裁剪框（8 手柄拖拽改 crop，合成坐标）；Inspector 显示 crop 数值 + 重置；Esc/双击空白退出。
5. **T5 画布补全**：画布框选 marquee；拖动吸附辅助线（对齐画布中心/边缘/其他 item 边缘，红线提示）；右键菜单（置顶/置底 = 移到最上/最下轨道）；剪贴板 Cmd+X/C/V/D（内部剪贴板，粘贴偏移 20px；粘贴系统文本 → 文本项；粘贴系统图片 → 导入）；对齐工具（水平/垂直居中、贴边）；Shift 解锁等比（已有）+ Inspector 宽高比锁定开关。
6. **T6 验证**：Playwright 全链路 + 截图确认。

滚动编辑（rolling edit）：相邻条块边界 Alt+拖动 → 一边 trim-end 一边 trim-start 同步。归入 T5。

## Self-Review
- §5.3 文本/媒体全属性 → T2/T3；§5.1 画布全交互 → T4/T5；字幕面板属性 → M7。
