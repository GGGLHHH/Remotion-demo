export { AnimationSection } from './animation'
export { CaptionsStyleSection } from './captions'
export { CompositionPanel, ExportSection } from './composition'
export { CropSection } from './crop'
export { FadeSection } from './fade'
export { FillSection } from './fill'
export { GenerateCaptionsSection } from './generate-captions'
export { LayoutSection } from './layout'
export { MediaSection } from './media'
// 检查器分区积木:跨类型共享分区 + 三组类型专属分区(text/media/captions) + 空状态/转场。
// 各类型面板(../panels)按需组合这些;Inspector 用它们拼 InspectorSections 命名空间。
export { SourceSection } from './source'
export { BackgroundSection, detectDirection, StrokeSection, TypographySection } from './text'
export { TransitionPanel } from './transition'
