import type React from 'react';
import { Composition, registerRoot } from 'remotion';
import { MainComposition } from './MainComposition';
import { calcDuration } from './duration';
import { createEmptyState, createTrack } from '../factories';

// 服务端渲染入口：元数据（时长/尺寸/fps）完全由 inputProps.state 决定
const defaultState = {
  ...createEmptyState({ width: 1280, height: 720 }),
  tracks: [createTrack('轨道 1')],
};

const Root: React.FC = () => (
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

registerRoot(Root);
