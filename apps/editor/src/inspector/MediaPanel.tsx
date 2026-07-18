import type React from 'react';
import type { AudioItem, GifItem, VideoItem } from '@editor/shared';
import { Switch } from '@/components/ui/switch';
import { useEditorStore } from '../state/store';
import { maxItemDurationInFrames } from '../timeline/ops';
import { Row, Section, SliderField } from './fields';

type MediaItem = VideoItem | AudioItem | GifItem;

const toDb = (v: number) => (v <= 0 ? '-∞' : `${(20 * Math.log10(v)).toFixed(1)}dB`);

export const MediaPanel: React.FC<{ item: MediaItem }> = ({ item }) => {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);

  const patch = (partial: Partial<MediaItem>, commit = true) =>
    updateUndoable(
      (s) => {
        const cur = s.items[item.id];
        if (!cur || cur.type !== item.type) return s;
        return { ...s, items: { ...s.items, [item.id]: { ...cur, ...partial } as typeof cur } };
      },
      { commit },
    );

  /** 变速：同步换算时长（官方行为），一条撤销记录 */
  const setSpeed = (rate: number) => {
    updateUndoable((s) => {
      const cur = s.items[item.id];
      if (!cur || !('playbackRate' in cur)) return s;
      const newDur = Math.max(1, Math.round((cur.durationInFrames * cur.playbackRate) / rate));
      const next = { ...cur, playbackRate: rate, durationInFrames: newDur };
      const capped = maxItemDurationInFrames({ ...s, items: { ...s.items, [item.id]: next } }, item.id);
      if (capped !== null && next.durationInFrames > capped) next.durationInFrames = Math.max(1, capped);
      return { ...s, items: { ...s.items, [item.id]: next } };
    });
  };

  const hasAudio = item.type === 'video' || item.type === 'audio';

  return (
    <Section title="媒体">
      <SliderField
        label="速度"
        value={item.playbackRate}
        min={0.25}
        max={5}
        step={0.05}
        display={`${item.playbackRate.toFixed(2)}x`}
        onChange={(v, committing) => {
          if (committing) setSpeed(v);
        }}
      />
      {hasAudio ? (
        <>
          <SliderField
            label="音量"
            value={(item as VideoItem | AudioItem).volume}
            min={0}
            max={1}
            step={0.01}
            display={toDb((item as VideoItem | AudioItem).volume)}
            onChange={(v, committing) => patch({ volume: v } as Partial<MediaItem>, committing)}
          />
          <Row label="静音">
            <Switch
              size="sm"
              checked={(item as VideoItem | AudioItem).muted}
              onCheckedChange={(checked) => patch({ muted: checked } as Partial<MediaItem>)}
            />
          </Row>
        </>
      ) : null}
    </Section>
  );
};
