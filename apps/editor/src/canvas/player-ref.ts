import { createRef, useEffect, useState, useSyncExternalStore } from 'react';
import type { PlayerRef } from '@remotion/player';

/** 全局唯一 Player 引用：CanvasView 挂载，快捷键/播放控件读取 */
export const playerRef = createRef<PlayerRef>();

/** 当前播放头帧（事件处理/渲染时直接读，不触发订阅） */
export const getPlayerFrame = (): number => playerRef.current?.getCurrentFrame() ?? 0;

/** frameupdate 订阅（useSyncExternalStore 用；模块级保持引用稳定） */
const subscribeFrame = (cb: () => void): (() => void) => {
  const p = playerRef.current;
  if (!p) return () => {};
  p.addEventListener('frameupdate', cb);
  return () => p.removeEventListener('frameupdate', cb);
};

/**
 * 订阅当前播放头帧（frameupdate），每帧触发一次重渲。
 * 仅适合极小的叶子组件（如时间码读数）；大组件请用 usePlayerFrameDerived。
 */
export const usePlayerFrame = (): number => {
  const [frame, setFrame] = useState(() => getPlayerFrame());
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    setFrame(p.getCurrentFrame());
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener('frameupdate', onFrame);
    return () => p.removeEventListener('frameupdate', onFrame);
  }, []);
  return frame;
};

/**
 * 订阅播放头帧的派生值：仅当派生结果（原始类型）变化时才触发重渲。
 * 播放期间把 ~30Hz 的帧流降为低频（如按钮禁用态翻转、秒级时间码），
 * 避免整个面板每帧重渲。derive 可闭包引用组件内的最新 state/props。
 */
export const usePlayerFrameDerived = <T extends string | number | boolean | null>(
  derive: (frame: number) => T,
): T => useSyncExternalStore(subscribeFrame, () => derive(getPlayerFrame()));
