import type React from 'react';
import type { AudioItem, GifItem, VideoItem } from '@gedatou/shared';
import { Switch } from '../../components/ui/switch';
import { useEditor } from '../../state/context';
import { maxItemDurationInFrames } from '../../timeline/ops';
import { FadeSliders, Row, Section, SliderField } from '../fields';
import { useT } from '../../lib/i18n';

type MediaItem = VideoItem | AudioItem | GifItem;

// 官方音量域为 dB 滑杆（-60…+20，步进 0.5，允许增益到 +20dB）；
// 与时间线音量线的映射一致（ItemBlock gainToTopFraction：80dB 跨度，顶 +20dB）
const linearToDb = (v: number) =>
  v <= 0.001 ? -60 : Math.max(-60, Math.min(20, 20 * Math.log10(v)));
const dbToLinear = (db: number) => (db <= -60 ? 0 : 10 ** (db / 20));

/** 媒体分区（官方 Video / Audio 区）：速度 / 音量 / 静音 / 淡入淡出，按 video/audio/gif 组装 */
export const MediaSection: React.FC<{ item: MediaItem }> = ({ item }) => {
  const t = useT();
  const updateUndoable = useEditor((s) => s.updateUndoable);
  const fps = useEditor((s) => s.undoable.fps);

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

  const rateSlider = (
    <SliderField
      label={t('mediaPanel.speed')}
      value={item.playbackRate}
      min={0.25}
      max={5}
      step={0.05}
      display={`${item.playbackRate.toFixed(2)}x`}
      onChange={(v, committing) => {
        if (committing) setSpeed(v);
      }}
    />
  );

  const fadeSliders = (
    <FadeSliders
      fadeInFrames={item.fadeInDurationInFrames}
      fadeOutFrames={item.fadeOutDurationInFrames}
      durationInFrames={item.durationInFrames}
      fps={fps}
      onPatch={(p) => patch(p as Partial<MediaItem>, false)}
    />
  );

  const audioRows = (it: VideoItem | AudioItem) => {
    const db = Math.round(linearToDb(it.volume) * 2) / 2;
    return (
      <>
        <SliderField
          label={t('mediaPanel.volume')}
          value={db}
          min={-60}
          max={20}
          step={0.5}
          display={db <= -60 ? '-∞ dB' : `${db.toFixed(1)} dB`}
          onChange={(v) => patch({ volume: dbToLinear(v) } as Partial<MediaItem>, false)}
        />
        <Row label={t('mediaPanel.mute')}>
          <Switch
            size="sm"
            checked={it.muted}
            onCheckedChange={(checked) => patch({ muted: checked } as Partial<MediaItem>)}
          />
        </Row>
      </>
    );
  };

  // 音频条目：官方结构里音量/淡入淡出/速度全部收在「音频」区
  if (item.type === 'audio') {
    return (
      <Section title={t('mediaPanel.audio')} collapsible defaultOpen={false}>
        {audioRows(item)}
        {fadeSliders}
        {rateSlider}
      </Section>
    );
  }

  // 视频/GIF：「视频」区放速度 + 视觉淡入淡出（不透明度）；
  // 有音轨的视频再加「音频」区（独立的音频淡变对，官方行为）
  return (
    <>
      <Section title={t('mediaPanel.video')} collapsible defaultOpen={false}>
        {rateSlider}
        {fadeSliders}
      </Section>
      {item.type === 'video' ? (
        <Section title={t('mediaPanel.audio')} collapsible defaultOpen={false}>
          {audioRows(item)}
          <FadeSliders
            fadeInFrames={item.audioFadeInDurationInFrames ?? 0}
            fadeOutFrames={item.audioFadeOutDurationInFrames ?? 0}
            durationInFrames={item.durationInFrames}
            fps={fps}
            fadeInField="audioFadeInDurationInFrames"
            fadeOutField="audioFadeOutDurationInFrames"
            onPatch={(p) => patch(p as Partial<MediaItem>, false)}
          />
        </Section>
      ) : null}
    </>
  );
};
