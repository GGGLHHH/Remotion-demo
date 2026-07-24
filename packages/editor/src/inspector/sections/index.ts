// 检查器分区积木:跨类型共享分区 + 三组类型专属分区(text/media/captions) + 空状态/转场。
// 各类型面板(../panels)按需组合这些;Inspector 用它们拼 InspectorSections 命名空间。
export { SourceSection } from './source';
export { LayoutSection } from './layout';
export { AnimationSection } from './animation';
export { FillSection } from './fill';
export { CropSection } from './crop';
export { FadeSection } from './fade';
export { GenerateCaptionsSection } from './generate-captions';
export { CompositionPanel, ExportSection } from './composition';
export { TransitionPanel } from './transition';
export { TypographySection, StrokeSection, BackgroundSection, detectDirection } from './text';
export { MediaSection } from './media';
export { CaptionsStyleSection } from './captions';
