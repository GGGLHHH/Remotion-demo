export { MainComposition } from './MainComposition';
export { CompositionRoot } from './Root';
export { FontGate } from './items/TextItemRenderer';
export { calcDuration } from './duration';
// getOrderedItems 主入口(.)也导出一份:渲染排序既是数据也是渲染层能力,两处刻意都留,消费者按语境选路径。
export { getOrderedItems } from './ordering';
export { ensureFontLoaded, listFontFamilies } from './fonts';
// 具名白名单(替代 export *):新增 export 到下列文件默认不进公共 API,须显式列入此处才生效——
// 堵住「文件里新加一个 export 就静默变成 semver 契约」的默认行为。
// easingFn 是纯内部 easing 实现(仅 keyframes.test.ts 直接 import ./keyframes),刻意不列入公共 API。
export { resolveProp, keyframeAt, upsertKeyframe, removeKeyframeAt, moveKeyframeInList, withKeyframeList } from './keyframes';
export { PRESET_IDS, buildPreset, type PresetId } from './animation-presets';
export { transitionVisual, getTransitionRenderProps, type TransitionRenderProps } from './transitions';
export { TRANSITION_PRESETS, presetIdOf, type TransitionPreset } from './transition-presets';
