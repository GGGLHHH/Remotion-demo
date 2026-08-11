import type { AnimatableProp, EditorStarterItem } from '@gedatou/shared'
import type React from 'react'
import type { PatchFn } from '../patch'
import { SquareRoundCornerIcon } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { useEditorRefs } from '../../state/context'
import { useAnimatedValue } from '../AnimatableField'
import { ColorField, Section, SliderField } from '../fields'
import { KeyframeToggle } from '../KeyframeToggle'
import { NumberField } from '../NumberField'
import { useItemKeyframes } from '../use-item-keyframes'

// ---- 填充（官方 Fill 区：透明度滑杆 + 颜色 + 圆角） ----

export const FillSection: React.FC<{
  item: EditorStarterItem
  patch: PatchFn
  color?: string
  onColor?: (v: string) => void
  showRadius?: boolean
}> = ({ item, patch, color, onColor, showRadius }) => {
  const t = useT()
  const kf = useItemKeyframes(item.id)
  const refs = useEditorRefs()
  const pct = Math.round(useAnimatedValue(item, 'opacity', kf) * 100)
  const animPatch = (prop: AnimatableProp, v: number, commit?: boolean): void => {
    if (kf.has(prop)) {
      const f = Math.max(0, Math.min(item.durationInFrames, refs.getPlayerFrame() - item.from))
      kf.setValue(prop, f, v, commit)
    }
    else {
      patch({ [prop]: v }, commit)
    }
  }
  return (
    <Section title={t('inspector.fill')} collapsible defaultOpen>
      <div className="flex items-end gap-1">
        <div className="flex-1 min-inline-0">
          <SliderField
            label={t('inspector.opacity')}
            value={pct}
            min={0}
            max={100}
            step={1}
            display={`${pct}%`}
            onChange={v => animPatch('opacity', v / 100, false)}
          />
        </div>
        <KeyframeToggle item={item} prop="opacity" kf={kf} />
      </div>
      {color !== undefined && onColor
        ? (
            <ColorField label={t('inspector.color')} value={color} onChange={onColor} />
          )
        : null}
      {showRadius
        ? (
            <NumberField
              label={t('inspector.borderRadius')}
              icon={SquareRoundCornerIcon}
              value={item.borderRadius}
              min={0}
              onChange={(v, c) => patch({ borderRadius: v }, c)}
            />
          )
        : null}
    </Section>
  )
}
