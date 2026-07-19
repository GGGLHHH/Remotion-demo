import type React from 'react';
import type { Caption, CaptionsItem } from '@editor/shared';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '../state/store';
import { NumberField } from './NumberField';
import { ColorField, Row, Section } from './fields';
import { FontPicker } from './FontPicker';

export const CaptionsPanel: React.FC<{ item: CaptionsItem }> = ({ item }) => {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);
  const asset = useEditorStore((s) => s.undoable.assets[item.assetId]);
  const captions = asset?.type === 'caption' ? asset.captions : [];

  const patch = (partial: Partial<CaptionsItem>, commit = true) =>
    updateUndoable(
      (s) => {
        const cur = s.items[item.id];
        if (!cur || cur.type !== 'captions') return s;
        return { ...s, items: { ...s.items, [item.id]: { ...cur, ...partial } } };
      },
      { commit },
    );

  /** 不可变更新 asset.captions 里第 i 条 token */
  const patchCaption = (index: number, partial: Partial<Caption>) =>
    updateUndoable((s) => {
      const cur = s.assets[item.assetId];
      if (!cur || cur.type !== 'caption') return s;
      const next = cur.captions.map((c, i) => (i === index ? { ...c, ...partial } : c));
      return { ...s, assets: { ...s.assets, [item.assetId]: { ...cur, captions: next } } };
    });

  return (
    <>
      <Section title="字幕样式">
        <Row label="字体">
          <FontPicker itemId={item.id} value={item.fontFamily} onCommit={(f) => patch({ fontFamily: f })} />
        </Row>
        <NumberField label="字号" value={item.fontSize} min={4} max={800} onChange={(v, c) => patch({ fontSize: v }, c)} />
        <ColorField label="颜色" value={item.color} onChange={(v) => patch({ color: v })} />
        <ColorField label="高亮色" value={item.highlightColor} onChange={(v) => patch({ highlightColor: v })} />
        <NumberField
          label="页时长ms"
          value={item.pageDurationInMs}
          min={100}
          max={10000}
          step={100}
          onChange={(v, c) => patch({ pageDurationInMs: v }, c)}
        />
        <NumberField
          label="最大行数"
          value={item.maxLines}
          min={1}
          max={10}
          onChange={(v, c) => patch({ maxLines: Math.round(v) }, c)}
        />
      </Section>
      <Section title="逐词修正">
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-0.5">
          {captions.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              {/* e2e 依赖 data-caption-word 定位逐词输入框 */}
              <Input
                key={`t${i}:${c.text}`}
                data-caption-word={i}
                className="h-7 flex-1 px-2 text-xs md:text-xs"
                defaultValue={c.text}
                onBlur={(e) => {
                  if (e.target.value !== c.text) patchCaption(i, { text: e.target.value });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              <Input
                key={`s${i}:${c.startMs}`}
                type="number"
                title="起始 ms"
                className="h-7 w-20 shrink-0 px-1.5 text-right text-xs tabular-nums md:text-xs"
                defaultValue={c.startMs}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v) && v !== c.startMs) {
                    patchCaption(i, { startMs: v, timestampMs: v });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          ))}
        </div>
      </Section>
    </>
  );
};
