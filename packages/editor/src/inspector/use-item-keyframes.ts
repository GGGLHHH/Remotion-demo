import { useMemo } from 'react';
import type { AnimatableProp, KeyframeEasing } from '@gedatou/shared';
import { keyframeAt, type PresetId } from '@gedatou/shared/composition';
import { useEditor, useEditorApi, useEditorRefs } from '../state/context';
import {
  applyAnimationPreset,
  clearKeyframes,
  moveKeyframe,
  setKeyframeEasing,
  setKeyframeValue,
  toggleKeyframe,
} from '../lib/keyframe-ops';

export type ItemKeyframesApi = {
  has: (prop: AnimatableProp) => boolean;
  at: (prop: AnimatableProp, frameInItem: number) => boolean;
  toggle: (prop: AnimatableProp, frameInItem: number) => void;
  setValue: (prop: AnimatableProp, frameInItem: number, value: number, commit?: boolean) => void;
  setEasing: (prop: AnimatableProp, frameInItem: number, easing: KeyframeEasing) => void;
  move: (prop: AnimatableProp, from: number, to: number, commit?: boolean) => void;
  clear: (prop: AnimatableProp) => void;
  applyPreset: (id: PresetId) => void;
  nextFrame: (prop: AnimatableProp, frameInItem: number) => number | null;
  prevFrame: (prop: AnimatableProp, frameInItem: number) => number | null;
  seekToItemFrame: (frameInItem: number) => void;
};

/** 检查器用的关键帧读写句柄：包 T5 的 keyframe-ops 命令 + 当前 item 的关键帧列表读取。 */
export const useItemKeyframes = (itemId: string): ItemKeyframesApi => {
  const api = useEditorApi();
  const refs = useEditorRefs();
  const item = useEditor((s) => s.undoable.items[itemId]);
  return useMemo<ItemKeyframesApi>(() => {
    const list = (prop: AnimatableProp) => item?.keyframes?.[prop] ?? [];
    return {
      has: (prop) => list(prop).length > 0,
      at: (prop, f) => !!keyframeAt(list(prop), f),
      toggle: (prop, f) => toggleKeyframe(api, itemId, prop, f),
      setValue: (prop, f, v, commit = true) => setKeyframeValue(api, itemId, prop, f, v, commit),
      setEasing: (prop, f, e) => setKeyframeEasing(api, itemId, prop, f, e),
      move: (prop, from, to, commit = true) => moveKeyframe(api, itemId, prop, from, to, commit),
      clear: (prop) => clearKeyframes(api, itemId, prop),
      applyPreset: (id) => applyAnimationPreset(api, itemId, id),
      nextFrame: (prop, f) => list(prop).find((k) => k.frame > f)?.frame ?? null,
      prevFrame: (prop, f) => [...list(prop)].reverse().find((k) => k.frame < f)?.frame ?? null,
      seekToItemFrame: (f) => refs.player.current?.seekTo((item?.from ?? 0) + f),
    };
  }, [api, refs, itemId, item]);
};
