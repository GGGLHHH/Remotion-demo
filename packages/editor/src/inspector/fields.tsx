import type React from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible'
import { Slider } from '../components/ui/slider'
import { useT } from '../lib/i18n'
import { useEditorApi } from '../state/context'

/**
 * 面板分区。collapsible 时标题为整行折叠按钮（官方样式，右侧箭头随展开态转 90°）；
 * 否则为静态标题（空状态面板：画布/时长/导出）。
 *
 * 折叠走 shadcn 官方写法：Collapsible.Panel + data-open/closed:animate-collapsible-*。
 * 原来是 `open ? <div> : null` —— 节点直接删掉，没有可动画的对象，展开是硬切。
 * 动画所需的 keyframes 由本包的 styles.css 提供（那里说明了为什么不能用官方那两个名字）。
 */
export const Section: React.FC<{
  title: string
  collapsible?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}> = ({ title, collapsible, defaultOpen = true, children }) => {
  if (!collapsible) {
    return (
      <div className="border-be border-border p-4">
        <div className="mbe-3 text-sm font-semibold">{title}</div>
        <div className="flex flex-col gap-2.5">{children}</div>
      </div>
    )
  }
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-be border-border">
      <CollapsibleTrigger className="
        group flex items-center justify-between px-4 py-3 text-sm font-semibold
        transition-colors inline-full
        hover:bg-accent/50
      "
      >
        {title}
        {/* 单个箭头转 90°，起止两态与原来的 ▶/▼ 一致，只是中间有了过渡。
            注意 Tailwind v4 的 rotate-90 写的是独立的 `rotate` 属性而非 `transform`。 */}
        <ChevronRightIcon className="
          text-muted-foreground transition-transform duration-200 block-3.5
          inline-3.5
          group-aria-expanded:rotate-90
        "
        />
      </CollapsibleTrigger>
      {/* overflow-hidden 必需：动画改的是高度，不裁掉内容会在收起过程中溢出到下一个分区上 */}
      <CollapsibleContent className="
        overflow-hidden
        data-open:animate-gd-collapse-down
        data-closed:animate-gd-collapse-up
      "
      >
        <div className="flex flex-col gap-2.5 px-4 pbe-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// 保持 <label> 结构：e2e 依赖 label:has-text(...) 选择器
export const Row: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="shrink-0 text-xs text-muted-foreground inline-14">{label}</span>
    <div className="flex flex-1 items-center gap-2 min-inline-0">{children}</div>
  </label>
)

/** 颜色：label 在上，裸原生 color input 色板（官方 50x27 样式，无十六进制读数） */
export const ColorField: React.FC<{ label: string, value: string, onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground inline-fit">{label}</span>
    <input
      type="color"
      value={value}
      className="
        cursor-pointer rounded-md border border-input bg-transparent p-0.5
        block-7 inline-12
        [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0
        [&::-webkit-color-swatch-wrapper]:p-0
      "
      onChange={e => onChange(e.target.value)}
    />
  </label>
)

/**
 * 滑杆（官方样式）：label 在上，滑杆 + 右侧纯文本读数。
 * 拖动中 committing=false（调用方应 commit:false 更新 store，画布实时可见）；
 * 松手 committing=true 回调后自动 commitPending —— 一次拖动一条撤销记录。
 */
export const SliderField: React.FC<{
  label: string
  value: number
  min: number
  max: number
  step: number
  display?: string
  onChange: (v: number, committing: boolean) => void
}> = ({ label, value, min, max, step, display, onChange }) => {
  const editorApi = useEditorApi()
  // 拖动期间用本地值驱动滑块，未提交到 store 也能跟手
  const [drag, setDrag] = useState<number | null>(null)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground inline-fit">{label}</span>
      <div className="flex items-center gap-2">
        <Slider
          className="flex-1 min-inline-0"
          min={min}
          max={max}
          step={step}
          value={[drag ?? value]}
          onValueChange={(v: number | readonly number[]) => {
            const n = typeof v === 'number' ? v : v[0]
            setDrag(n)
            onChange(n, false)
          }}
          onValueCommitted={(v: number | readonly number[]) => {
            const n = typeof v === 'number' ? v : v[0]
            setDrag(null)
            onChange(n, true)
            editorApi.getState().commitPending()
          }}
        />
        <span className="
          shrink-0 text-end text-xs text-muted-foreground tabular-nums inline-14
        "
        >
          {display ?? drag ?? value}
        </span>
      </div>
    </label>
  )
}

type FadeField
  = | 'fadeInDurationInFrames'
    | 'fadeOutDurationInFrames'
    | 'audioFadeInDurationInFrames'
    | 'audioFadeOutDurationInFrames'

/** 淡入/淡出滑杆对：0 → 条目时长（秒），步进 0.1，读数 '0.0s'（官方 Fade 控件） */
export const FadeSliders: React.FC<{
  fadeInFrames: number
  fadeOutFrames: number
  durationInFrames: number
  fps: number
  /** 写入的字段名对：默认视觉淡变；视频「音频」区传 audioFade* 对 */
  fadeInField?: FadeField
  fadeOutField?: FadeField
  /** 始终 commit:false 更新，松手由 SliderField 自动 commitPending */
  onPatch: (p: Partial<Record<FadeField, number>>) => void
}> = ({
  fadeInFrames,
  fadeOutFrames,
  durationInFrames,
  fps,
  fadeInField = 'fadeInDurationInFrames',
  fadeOutField = 'fadeOutDurationInFrames',
  onPatch,
}) => {
  const t = useT()
  const maxS = Math.max(0.1, durationInFrames / fps)
  return (
    <>
      <SliderField
        label={t('fields.fadeIn')}
        value={fadeInFrames / fps}
        min={0}
        max={maxS}
        step={0.1}
        display={`${(fadeInFrames / fps).toFixed(1)}s`}
        onChange={v => onPatch({ [fadeInField]: Math.round(v * fps) })}
      />
      <SliderField
        label={t('fields.fadeOut')}
        value={fadeOutFrames / fps}
        min={0}
        max={maxS}
        step={0.1}
        display={`${(fadeOutFrames / fps).toFixed(1)}s`}
        onChange={v => onPatch({ [fadeOutField]: Math.round(v * fps) })}
      />
    </>
  )
}
