# @gedatou/editor + @gedatou/shared 库架构优化设计(2026-07-24)

> 方法:9 视角并行精读(8 子系统 + 1 打包/API 面)→ 库架构师综合。
> 视角:**npm 库** —— 公共 API 契约神圣;优先「内部纯移动/封装、不动导出契约」的改动,破坏 API 的单列并标 break;
> tree-shaking / sideEffects / peerDeps / phantom dep 这类「库正确性」优先于纯代码整洁。ponytail:能不写就不写。

## 一、总体判断

**两个库整体健康**,不需要重构骨架。做对的部分(直接作范式,勿动):

- **`editor/src/index.ts`(105 行)与 `adapters/index.ts` 全走显式具名导出、零 `export *`** —— 公共 API 面精心策划,是 shared 整改的参照。
- **注入缝设计**:`createInstanceRefs` 每实例 refs 袋子已替代模块级单例;store/EditorProvider 均工厂函数创建,无模块顶层副作用。
- **打包契约核实无误**:`sideEffects`(shared `false` / editor `["**/*.css"]`)逐模块可信;`exports`/`publishConfig` 双轨(src↔dist)与产物文件名一一对应,subpath 解析正确;peerDeps 声明齐全(react-dom/@remotion/* 是有意「多声明」替消费方列出 shared 传递性 peer,非 phantom);cva/clsx/cmdk/tailwind-merge 放 dependencies(bundle)合理。

**债分两类**:

1. **动 API 契约类(趁 0.3.0 早期窗口收窄)**:shared 的两个 barrel(`src/index.ts` 与 `composition/index.ts`)用 `export *` 把内部 helper(`groups` 8 函数、`download-name`、`keyframes/transitions` 内部辅助;`easingFn` 已核实**仅测试消费**)不经审阅锁成 semver 契约 —— **全库最大库正确性隐患,越晚改代价越大**。
2. **内部纯移动类(不破坏任何导出)**:
   - `/adapters` subpath 经 `i18n.ts → context.tsx` **传递性把 React+zustand 拖进「号称 framework-free」的 bundle**(esbuild 摇不掉 context.tsx 模块顶层 `createContext`)。
   - 四个大文件(`TimelinePanel` 1113 / `ItemBlock` 504 / `SelectionOverlay` 481 / `store` 317)可做保持组件/类型契约不变的内部拆。
   - 跨子系统重复:pointer-drag 样板(3×)、坐标换算(5×)、inspector patch(3×)。

> **更正九视角报告**:`input-group.tsx` 非死代码(`command.tsx` 的 `CommandInput` 消费 `InputGroup`);真正死的仅 `dialog.tsx`(经 `command.tsx` 里零引用的 `CommandDialog` 可达)。

## 二、跨子系统模式

| # | 模式 | 出现处 | 收敛方式 | Break? |
|---|---|---|---|---|
| T1 | `export *` barrel 把内部 helper 锁成公共 semver 契约 | shared `index.ts`(groups/download-name/getOrderedItems 重复)、`composition/index.ts`(easingFn+keyframes/transitions 内部辅助) | 以 `editor/index.ts` 为范式改具名白名单 | **是** |
| T2 | 大文件缺内部分层:纯函数散落组件顶层、拖拽状态机与 JSX 糅在一个组件 | TimelinePanel / ItemBlock / SelectionOverlay / store | 纯函数搬 geometry/math 模块、拖拽抽 hook、JSX 抽子组件、store 拆 slice —— 全保持公开签名 | 否 |
| T3 | pointer-capture+move/up+commitPending 拖拽样板与坐标换算跨子系统重复手写 | ItemBlock/TimelinePanel/transition(3×)、5 处 `(clientX-rect.left)/scale` | 抽最小 `startPointerDrag` 原语 + geometry `toStagePoint/toDelta`;叠加逻辑(Escape/自动滚动/阈值)留调用方 | 否 |
| T4 | 模块归属/依赖方向反了(内部路径) | `CORNERS/EDGES/SizeBadge` 挂 SelectionOverlay 被另两 overlay 反向 import;`player-ref.ts` 在 canvas/ 却被 inspector/playback/timeline 5 处消费 | 下次 touch 顺手挪(handle-primitives、player-ref→state/lib),同步内部相对 import | 否 |
| T5 | 发布/维护一致性小隐患 | TS 版本 skew(editor `~6.0.2` vs shared `^5.9.0`)、release.yml 只校验 editor 版本、无 LICENSE 却声明 MIT、editor 发 `src/styles.css` 需 README 标注 Tailwind v4 前提 | 全 non-break 维护活,批量清 | 否 |

## 三、优化路线(按 ROI 排序)

### A 组 —— 不破坏 API 的内部改动 + 库正确性(先做)

| # | 事项 | 动哪里 | 收益 | Effort | Break |
|---|---|---|---|---|---|
| 1 | 拆 `i18n.ts` 纯逻辑 vs React hook | `lib/i18n.ts` → 纯模块(resolveMessage/interpolate/enMessages/tFor)+ 单独 `useT`;`persistence.ts` 只 import 纯半边 | 堵住 `/adapters` 传递性拖入 React+zustand,**库正确性缺陷**,最高 ROI | S | 否 |
| 3 | 删 `dialog.tsx` + 未用 `CommandDialog` | 删 `components/ui/dialog.tsx`,从 `command.tsx` 移除 `CommandDialog` + 其 `./dialog` import | 去死源码(input-group 存活,勿删) | S | 否 |
| 7 | 小额去重批处理 | text/media/captions section 内联 patch → 复用 `useItemPatch`;`ItemBlock` 数学(formatDb/wedgePath…)搬 `item-block-math.ts`;`commands.ts:117` `frame` 形参改名 `atFrame` 去遮蔽 | 消 3 处 patch 复制 + 纯函数脱 React 可测 + 消一处遮蔽隐患 | S | 否 |
| 5 | 抽 `startPointerDrag` + geometry 坐标工具 | `timeline/use-pointer-drag.ts`(capture+move/up 生命周期)供 ItemBlock/TimelinePanel 复用;`canvas/geometry.ts` 加 `toStagePoint/toDelta` 供 5 overlay 复用 | 收敛 3 处拖拽骨架 + 5 处坐标换算 | M | 否 |
| 9 | 发布/维护一致性收尾 | TS devDep 对齐 monorepo 根;release.yml 校验纳入 shared 版本;补仓库级 LICENSE;editor/README 标注 Tailwind v4 前提 | 消 skew/校验缺口/许可证声明无据 | S | 否 |

### B 组 —— 大文件内部拆分(单独落地,纯内部、零 break,但体量大)

| # | 事项 | 动哪里 | Effort |
|---|---|---|---|
| 4 (B1) | `TimelinePanel` 1113 内部分层 | 抽 `geometry.ts`(rowHeightOf/rowTops/trackIndexAtY)、`use-move-drag.ts`、`use-trim-marquee-drag.ts`、`TimelineToolbar.tsx`、`TimelineTracks.tsx`+`TimelineOverlays.tsx`;保持 `Timeline` props `{className?}` 不变 | L |
| 6 (B2) | `SelectionOverlay` 481 拆 + 修反向依赖 | `CORNERS/EDGES/SizeBadge` → `handle-primitives.tsx`;抽 `useSelectionDrag`;组件体只剩渲染+右键菜单+接线 | M |
| 8 (B3) | `store` 317 按域拆 slice(可选) | history/selection/canvas/timeline/asset/clipboard 各抽 `(set,get)=>Partial<EditorStore>`;`pendingBase` 闭包必须与 history slice 一起搬。`createEditorStore`/`EditorStore` 签名不变 | M |

### C 组 —— 破坏 API,需拍板(单列)

| # | 事项 | 动哪里 | 为何值得 | Break |
|---|---|---|---|---|
| 2 | 收窄 shared 两个 barrel:`export *` → 具名白名单 | `shared/src/index.ts`、`shared/src/composition/index.ts`;删零消费的 `easingFn` 导出、去 `getOrderedItems` 双入口重复、`groups`/`download-name` 不再从包根导出(仅 editor 内部相对 import) | 全库最大 semver 隐患;趁 0.3.0 未文档化收窄成本最低;「文件新增 export=自动公开」的默认行为被堵死。先确认 `upsert/remove/withKeyframeList` 是否需留给自定义渲染器(editor 确在消费,勿误删),CHANGELOG 注明移除未文档化导出 | **是** |

## 四、明确不动

- `editor/src/index.ts` + `adapters/index.ts`:具名导出范式,勿动。
- 注入缝(`createInstanceRefs`/`player-ref` 每实例 refs)、`sideEffects`/`exports`/`publishConfig` 双轨、peerDeps 多声明、cva/clsx/cmdk/tailwind-merge bundle —— 全部核实正确,勿动。
- `ops.ts`(332 行全纯函数)、Ruler/Playhead/Filmstrip 叶子组件 —— 体量职责匹配。
- `CropOverlay` 8 向 resize 不抽通用引擎(约束与 `geometry.resizeRect` 不同,强抽收益<成本)。
- `types.ts`(189 行,6 域)先不拆(仍在合理阅读范围,YAGNI;奔 300+ 再动)。
- `createCustomItem`/`DEFAULT_FPS` 非死代码,是留给外部消费方的扩展点/默认值契约,勿删。

## 五、执行顺序建议

**A 组(1→3→7→5→9)先做**,每步 typecheck+test 后单独提交;**B 组** 各自一提交;**C 组(rank 2)破坏 API,需你拍板**是否趁 0.3.0 窗口收窄。
