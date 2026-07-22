import type React from 'react';
import { Diamond } from 'lucide-react';
import type { AnimatableProp, EditorStarterItem } from '@gedatou/shared';
import { usePlayerFrameDerived } from '../canvas/player-ref';
import { cn } from '../lib/utils';
import type { ItemKeyframesApi } from './use-item-keyframes';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** 检查器数值行旁的 ◆：空心=当前帧无关键帧(点击在播放头加一个)，实心=有(点击删)；
 *  有关键帧时旁边露出 ◀▶ 跳转上/下一个关键帧。 */
export const KeyframeToggle: React.FC<{
  item: EditorStarterItem;
  prop: AnimatableProp;
  kf: ItemKeyframesApi;
}> = ({ item, prop, kf }) => {
  const frameInItem = usePlayerFrameDerived((f) => clamp(f - item.from, 0, item.durationInFrames));
  const active = kf.at(prop, frameInItem);
  const has = kf.has(prop);
  const go = (target: number | null) => target != null && kf.seekToItemFrame(target);
  return (
    <span className="inline-flex items-center gap-0.5">
      {has && (
        <button
          type="button"
          aria-label="prev keyframe"
          className="text-muted-foreground disabled:opacity-30"
          disabled={kf.prevFrame(prop, frameInItem) == null}
          onClick={() => go(kf.prevFrame(prop, frameInItem))}
        >
          ◀
        </button>
      )}
      <button
        type="button"
        aria-label="toggle keyframe"
        className={cn('rounded p-0.5', active ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
        onClick={() => kf.toggle(prop, frameInItem)}
      >
        <Diamond className={cn('size-3', active && 'fill-current')} />
      </button>
      {has && (
        <button
          type="button"
          aria-label="next keyframe"
          className="text-muted-foreground disabled:opacity-30"
          disabled={kf.nextFrame(prop, frameInItem) == null}
          onClick={() => go(kf.nextFrame(prop, frameInItem))}
        >
          ▶
        </button>
      )}
    </span>
  );
};
