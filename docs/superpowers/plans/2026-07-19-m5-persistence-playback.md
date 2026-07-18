# M5：持久化 + 播放控制条 + 素材清理 实施计划

> REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** 刷新不丢工程；播放控制条完善；两阶段素材删除清理。

**规格来源:** specs §7 §5.4 §6.1、M5 验收

## Tasks

1. **T1 持久化**：`persistence/persistence.ts`：`saveState()`（localStorage key `remotion-editor-state-v1`，仅 undoable）、`loadState()`、`downloadStateFile()`/`loadStateFromFile()`、`#state=<base64>` URL hash 解析；启动优先级 hash > localStorage > demo；启动时从 IndexedDB 恢复 localUrls；顶栏保存按钮（有未保存更改时高亮）+ Cmd/Ctrl+S + 下载/导入状态按钮。
2. **T2 素材两阶段删除**：deleteSelected 时把不再被引用的 asset 移入 `deletedAssets`；顶栏"清理素材(N)"按钮（deletedAssets 非空时显示）→ 确认后清撤销栈 → 服务端 `POST /api/delete-asset`（DeleteObjectCommand）+ IndexedDB 删除 + 从 state 移除。
3. **T3 播放控制条**：画布下方一条：播放/暂停、`MM:SS.FF` 帧精度时间码、跳头/跳尾、全局静音、循环开关、全屏（Esc 退出）；store 加 `loop`；beforeunload 拦截（上传/渲染进行中）。
4. **T4 验证**：Playwright：改动 → Cmd+S → reload → 状态还原；URL hash 加载；时间码/跳转/循环断言；清理素材端到端（MinIO 对象消失）。

## Self-Review
- §7 全覆盖（手动保存/下载导入/URL hash/IndexedDB 恢复）；§5.4 控制条全覆盖；§6.1 删除链路补齐。自动保存明确不做（官方同款）。
