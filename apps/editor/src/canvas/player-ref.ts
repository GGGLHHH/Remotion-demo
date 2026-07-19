import { createRef, useEffect, useState } from 'react';
import type { PlayerRef } from '@remotion/player';

/** 全局唯一 Player 引用：CanvasView 挂载，快捷键/播放控件读取 */
export const playerRef = createRef<PlayerRef>();

/** 订阅当前播放头帧（frameupdate），用于随播放头变化的 UI（如按钮禁用态） */
export const usePlayerFrame = (): number => {
  const [frame, setFrame] = useState(() => playerRef.current?.getCurrentFrame() ?? 0);
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
