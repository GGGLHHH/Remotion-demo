export { buildPreset, PRESET_IDS, type PresetId } from './animation-presets'
export { calcDuration } from './duration'
export { ensureFontLoaded, listFontFamilies } from './fonts'
export { FontGate } from './items/TextItemRenderer'
// 具名白名单(替代 export *):新增 export 到下列文件默认不进公共 API,须显式列入此处才生效——
// 堵住「文件里新加一个 export 就静默变成 semver 契约」的默认行为。
// easingFn 是纯内部 easing 实现(仅 keyframes.test.ts 直接 import ./keyframes),刻意不列入公共 API。
export { keyframeAt, moveKeyframeInList, removeKeyframeAt, resolveProp, upsertKeyframe, withKeyframeList } from './keyframes'
export { MainComposition } from './MainComposition'
// getOrderedItems 主入口(.)也导出一份:渲染排序既是数据也是渲染层能力,两处刻意都留,消费者按语境选路径。
export { getOrderedItems } from './ordering'
export { CompositionRoot } from './Root'
export { presetIdOf, TRANSITION_PRESETS, type TransitionPreset } from './transition-presets'
export { getTransitionRenderProps, type TransitionRenderProps, transitionVisual } from './transitions'
