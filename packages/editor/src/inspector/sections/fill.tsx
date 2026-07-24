import type React from 'react';
import { SquareRoundCornerIcon } from 'lucide-react';
import type { AnimatableProp, EditorStarterItem } from '@gedatou/shared';
import { useEditorRefs } from '../../state/context';
import { useT } from '../../lib/i18n';
import { NumberField } from '../NumberField';
import { ColorField, Section, SliderField } from '../fields';
import { KeyframeToggle } from '../KeyframeToggle';
import { useItemKeyframes } from '../use-item-keyframes';
import { useAnimatedValue } from '../AnimatableField';
import type { PatchFn } from '../patch';

// ---- 填充（官方 Fill 区：透明度滑杆 + 颜色 + 圆角） ----

export const FillSection: React.FC<{
  item: EditorStarterItem;
  patch: PatchFn;
  color?: string;
  onColor?: (v: string) => void;
  showRadius?: boolean;
}> = ({ item, patch, color, onColor, showRadius }) => {
  const t = useT();
  const kf = useItemKeyframes(item.id);
  const refs = useEditorRefs();
  const pct = Math.round(useAnimatedValue(item, 'opacity', kf) * 100);
  const animPatch = (prop: AnimatableProp, v: number, commit?: boolean) => {
    if (kf.has(prop)) {
      const f = Math.max(0, Math.min(item.durationInFrames, refs.getPlayerFrame() - item.from));
      kf.setValue(prop, f, v, commit);
    } else {
      patch({ [prop]: v } as Partial<EditorStarterItem>, commit);
    }
  };
  return (
    <Section title={t('inspector.fill')} collapsible defaultOpen>
      <div className="flex items-end gap-1">
        <div className="min-w-0 flex-1">
          <SliderField
            label={t('inspector.opacity')}
            value={pct}
            min={0}
            max={100}
            step={1}
            display={`${pct}%`}
            onChange={(v) => animPatch('opacity', v / 100, false)}
          />
        </div>
        <KeyframeToggle item={item} prop="opacity" kf={kf} />
      </div>
      {color !== undefined && onColor ? (
        <ColorField label={t('inspector.color')} value={color} onChange={onColor} />
      ) : null}
      {showRadius ? (
        <NumberField
          label={t('inspector.borderRadius')}
          icon={SquareRoundCornerIcon}
          value={item.borderRadius}
          min={0}
          onChange={(v, c) => patch({ borderRadius: v }, c)}
        />
      ) : null}
    </Section>
  );
};
