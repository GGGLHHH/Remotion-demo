import { createRef } from 'react';
import type { PlayerRef } from '@remotion/player';

/** 全局唯一 Player 引用：CanvasView 挂载，快捷键/播放控件读取 */
export const playerRef = createRef<PlayerRef>();
