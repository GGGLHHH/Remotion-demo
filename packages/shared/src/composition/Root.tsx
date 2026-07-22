import type React from 'react';
import { Composition } from 'remotion';
import { MainComposition } from './MainComposition';
import { calcDuration } from './duration';
import { createEmptyState, createTrack } from '../factories';

// 渲染根:元数据(时长/尺寸/fps)完全由 inputProps.state 决定。
// 库自带入口 entry.tsx 直接 registerRoot 它;注册了 custom item 渲染器的消费端
// 应自建入口(先 import 注册模块,再 registerRoot(CompositionRoot)),否则渲染 bundle 缺渲染器。
const defaultState = {
  ...createEmptyState({ width: 1280, height: 720 }),
  tracks: [createTrack('轨道 1')],
};

export const CompositionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={MainComposition}
    defaultProps={{ state: defaultState }}
    durationInFrames={calcDuration(defaultState.items)}
    fps={defaultState.fps}
    width={defaultState.compositionWidth}
    height={defaultState.compositionHeight}
    calculateMetadata={({ props }) => ({
      durationInFrames: calcDuration(props.state.items),
      fps: props.state.fps,
      width: props.state.compositionWidth,
      height: props.state.compositionHeight,
    })}
  />
);
