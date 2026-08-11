import type React from 'react'
import { presetIdOf, TRANSITION_PRESETS } from '@gedatou/shared/composition'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { applyTransitionDuration, applyTransitionPreset, removeTransition } from '../../lib/transition-ops'
import { useEditor, useEditorApi } from '../../state/context'
import { Row, Section } from '../fields'
import { NumberField } from '../NumberField'

// ---- 转场面板：选中时间线上的转场 pill 时显示（互斥已由 store 保证） ----

export const TransitionPanel: React.FC<{ id: string }> = ({ id }) => {
  const api = useEditorApi()
  const t = useEditor(s => s.undoable.transitions?.[id])
  const [presetOpen, setPresetOpen] = useState(false)
  if (!t)
    return null
  const currentLabel = TRANSITION_PRESETS.find(p => p.id === presetIdOf(t))?.label ?? 'Cross Dissolve'
  return (
    <Section title="Transition">
      <Row label="Type">
        <Popover open={presetOpen} onOpenChange={setPresetOpen}>
          <PopoverTrigger render={(
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
            />
          )}
          >
            {currentLabel}
            <ChevronDownIcon />
          </PopoverTrigger>
          <PopoverContent align="start" className="gap-0.5 p-1 inline-40">
            {TRANSITION_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                className="
                  rounded-md px-2 py-1 text-start text-xs
                  hover:bg-accent
                "
                onClick={() => {
                  applyTransitionPreset(api, id, p.id)
                  setPresetOpen(false)
                }}
              >
                {p.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </Row>
      <Row label="Duration">
        <NumberField
          inline
          label=""
          value={t.durationInFrames}
          onChange={(v, c) => applyTransitionDuration(api, id, v, c)}
        />
      </Row>
      <Button size="sm" variant="ghost" onClick={() => removeTransition(api, id)}>
        Remove
      </Button>
    </Section>
  )
}
