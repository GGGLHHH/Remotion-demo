import { createRef } from 'react';
import type { PlayerRef } from '@remotion/player';

/**
 * 每实例的可变 refs 袋子：替代原 canvas 模块级单例
 * （player-ref.ts 的 playerRef / fit-scale.ts 的 panRef/fitScaleRef/stageElRef）。
 * 由 <EditorProvider> 每挂载建一次，经 useEditorRefs() 下发——随实例隔离，一页多个编辑器互不串台。
 *
 * getPlayerFrame/subscribeFrame/setPan 做成袋子上的**稳定方法**（袋子只建一次，引用恒定），
 * 以满足 useSyncExternalStore 对 subscribe 稳定性的要求，并保留 setPan 直写 DOM 的零重渲性能路径。
 */
export function createInstanceRefs() {
  const player = createRef<PlayerRef>();
  const pan = { current: { x: 0, y: 0 } };
  const fitScale = { current: 1 };
  const stageEl = { current: null as HTMLElement | null };

  return {
    /** Player 引用：<Player ref={refs.player}> 挂载，快捷键/播放控件读取 */
    player,
    /** 舞台平移偏移（容器坐标系 px）：自由视口原点，居中只是"适应"模式的派生值 */
    pan,
    /** 画布适配缩放值：布局时持续写入，作工具栏对比与相对缩放基准 */
    fitScale,
    /** 舞台 DOM 节点：setPan 直写样式用 */
    stageEl,

    /** 当前播放头帧（事件处理/渲染时直接读，不触发订阅） */
    getPlayerFrame: (): number => player.current?.getCurrentFrame() ?? 0,

    /** frameupdate 订阅（useSyncExternalStore 用；方法引用稳定） */
    subscribeFrame: (cb: () => void): (() => void) => {
      const p = player.current;
      if (!p) return () => {};
      p.addEventListener('frameupdate', cb);
      return () => p.removeEventListener('frameupdate', cb);
    },

    /** 更新平移：直写 DOM（left/top），不触发 React 重渲——Player 子树完全不动 */
    setPan: (x: number, y: number): void => {
      pan.current = { x, y };
      const el = stageEl.current;
      if (el) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    },
  };
}

export type EditorInstanceRefs = ReturnType<typeof createInstanceRefs>;
