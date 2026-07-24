import type React from 'react';
import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { TRANSITION_PRESETS, presetIdOf } from '@gedatou/shared/composition';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { useEditor, useEditorApi } from '../../state/context';
import { applyTransitionDuration, applyTransitionPreset, removeTransition } from '../../lib/transition-ops';
import { NumberField } from '../NumberField';
import { Row, Section } from '../fields';

// ---- 转场面板：选中时间线上的转场 pill 时显示（互斥已由 store 保证） ----

export const TransitionPanel: React.FC<{ id: string }> = ({ id }) => {
  const api = useEditorApi();
  const t = useEditor((s) => s.undoable.transitions?.[id]);
  const [presetOpen, setPresetOpen] = useState(false);
  if (!t) return null;
  const currentLabel = TRANSITION_PRESETS.find((p) => p.id === presetIdOf(t))?.label ?? 'Cross Dissolve';
  return (
    <Section title="Transition">
      <Row label="Type">
        <Popover open={presetOpen} onOpenChange={setPresetOpen}>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="gap-1" />}>
            {currentLabel}
            <ChevronDownIcon />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-40 gap-0.5 p-1">
            {TRANSITION_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                onClick={() => {
                  applyTransitionPreset(api, id, p.id);
                  setPresetOpen(false);
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
  );
};
