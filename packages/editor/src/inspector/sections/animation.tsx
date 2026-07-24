import type React from 'react';
import { useState } from 'react';
import { ChevronDownIcon, XIcon } from 'lucide-react';
import { ANIMATABLE_PROPS } from '@gedatou/shared';
import { PRESET_IDS } from '@gedatou/shared/composition';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { useT } from '../../lib/i18n';
import { Row, Section } from '../fields';
import { useItemKeyframes } from '../use-item-keyframes';

// ---- 动画预设（一键套用：写入多属性关键帧，见 lib/keyframe-ops#applyAnimationPreset） ----

export const AnimationSection: React.FC<{ itemId: string }> = ({ itemId }) => {
  const t = useT();
  const kf = useItemKeyframes(itemId);
  const [presetOpen, setPresetOpen] = useState(false);
  const keyframedProps = ANIMATABLE_PROPS.filter((p) => kf.has(p));
  return (
    <Section title={t('inspector.animation')} collapsible defaultOpen={false}>
      <Row label={t('inspector.preset')}>
        <Popover open={presetOpen} onOpenChange={setPresetOpen}>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="gap-1" />}>
            {t('inspector.applyPreset')}
            <ChevronDownIcon />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-40 gap-0.5 p-1">
            {PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                onClick={() => {
                  kf.applyPreset(id);
                  setPresetOpen(false);
                }}
              >
                {id}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </Row>
      {keyframedProps.length > 0 ? (
        keyframedProps.map((p) => (
          <Row key={p} label={p}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`clear ${p} keyframes`}
              onClick={() => kf.clear(p)}
            >
              <XIcon />
            </Button>
          </Row>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">{t('inspector.noKeyframes')}</span>
      )}
    </Section>
  );
};
