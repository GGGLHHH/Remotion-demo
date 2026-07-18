import type React from 'react';
import { useState } from 'react';
import type { EditorStarterItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { NumberField } from './NumberField';
import { ColorField, Row, Section } from './fields';
import { TextPanel } from './TextPanel';
import { MediaPanel } from './MediaPanel';

const CompositionPanel: React.FC = () => {
  const width = useEditorStore((s) => s.undoable.compositionWidth);
  const height = useEditorStore((s) => s.undoable.compositionHeight);
  const updateUndoable = useEditorStore((s) => s.updateUndoable);

  return (
    <Section title="合成设置">
      <NumberField
        label="宽度"
        value={width}
        min={2}
        onCommit={(v) => updateUndoable((s) => ({ ...s, compositionWidth: Math.round(v / 2) * 2 }))}
      />
      <NumberField
        label="高度"
        value={height}
        min={2}
        onCommit={(v) => updateUndoable((s) => ({ ...s, compositionHeight: Math.round(v / 2) * 2 }))}
      />
      <button
        className="mt-1 rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
        onClick={() =>
          updateUndoable((s) => ({
            ...s,
            compositionWidth: s.compositionHeight,
            compositionHeight: s.compositionWidth,
          }))
        }
      >
        交换尺寸 ⇄
      </button>
    </Section>
  );
};

const ALIGNS: { key: string; label: string; apply: (compW: number, compH: number, it: EditorStarterItem) => Partial<EditorStarterItem> }[] = [
  { key: 'l', label: '⇤', apply: () => ({ left: 0 }) },
  { key: 'ch', label: '⇹', apply: (w, _h, it) => ({ left: Math.round((w - it.width) / 2) }) },
  { key: 'r', label: '⇥', apply: (w, _h, it) => ({ left: w - it.width }) },
  { key: 't', label: '⤒', apply: () => ({ top: 0 }) },
  { key: 'cv', label: '⇳', apply: (_w, h, it) => ({ top: Math.round((h - it.height) / 2) }) },
  { key: 'b', label: '⤓', apply: (_w, h, it) => ({ top: h - it.height }) },
];

const ItemPanel: React.FC<{ item: EditorStarterItem }> = ({ item }) => {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);
  const setItemSelectedForCrop = useEditorStore((s) => s.setItemSelectedForCrop);
  const fps = useEditorStore((s) => s.undoable.fps);
  const asset = useEditorStore((s) =>
    'assetId' in item ? s.undoable.assets[item.assetId] : undefined,
  );
  const [aspectLocked, setAspectLocked] = useState(false);

  const patch = (partial: Partial<EditorStarterItem>) => {
    updateUndoable((s) => {
      const cur = s.items[item.id];
      if (!cur) return s;
      return { ...s, items: { ...s.items, [item.id]: { ...cur, ...partial } as EditorStarterItem } };
    });
  };

  const isVisual = item.type !== 'audio';
  const croppable = item.type === 'video' || item.type === 'image';

  return (
    <>
      <Section title={`${item.type} 属性`}>
        {asset ? <div className="truncate text-xs text-zinc-500">{asset.filename}</div> : null}
        {isVisual ? (
          <>
            <NumberField label="X" value={item.left} onCommit={(v) => patch({ left: v })} />
            <NumberField label="Y" value={item.top} onCommit={(v) => patch({ top: v })} />
            <NumberField
              label="宽"
              value={item.width}
              min={20}
              onCommit={(v) =>
                patch(
                  aspectLocked
                    ? { width: v, height: Math.max(20, Math.round((v * item.height) / item.width)) }
                    : { width: v },
                )
              }
            />
            <NumberField
              label="高"
              value={item.height}
              min={20}
              onCommit={(v) =>
                patch(
                  aspectLocked
                    ? { height: v, width: Math.max(20, Math.round((v * item.width) / item.height)) }
                    : { height: v },
                )
              }
            />
            <Row label="锁比例">
              <input
                type="checkbox"
                checked={aspectLocked}
                onChange={(e) => setAspectLocked(e.target.checked)}
              />
            </Row>
            <Row label="旋转°">
              <NumberFieldInline value={item.rotation} onCommit={(v) => patch({ rotation: v })} />
              <button
                className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                title="旋转 90°"
                onClick={() => patch({ rotation: (item.rotation + 90) % 360 })}
              >
                ↻90°
              </button>
            </Row>
            <NumberField
              label="透明%"
              value={Math.round(item.opacity * 100)}
              min={0}
              max={100}
              onCommit={(v) => patch({ opacity: v / 100 })}
            />
            <NumberField
              label="圆角"
              value={item.borderRadius}
              min={0}
              onCommit={(v) => patch({ borderRadius: v })}
            />
            <Row label="对齐">
              {ALIGNS.map((a) => (
                <button
                  key={a.key}
                  className="flex-1 rounded border border-zinc-700 px-1 py-1 text-xs hover:bg-zinc-800"
                  onClick={() =>
                    updateUndoable((s) => {
                      const cur = s.items[item.id];
                      if (!cur) return s;
                      return {
                        ...s,
                        items: {
                          ...s.items,
                          [item.id]: {
                            ...cur,
                            ...a.apply(s.compositionWidth, s.compositionHeight, cur),
                          } as EditorStarterItem,
                        },
                      };
                    })
                  }
                >
                  {a.label}
                </button>
              ))}
            </Row>
          </>
        ) : null}
        <NumberField
          label="淡入s"
          value={Number((item.fadeInDurationInFrames / fps).toFixed(2))}
          min={0}
          step={0.1}
          onCommit={(v) => patch({ fadeInDurationInFrames: Math.round(v * fps) })}
        />
        <NumberField
          label="淡出s"
          value={Number((item.fadeOutDurationInFrames / fps).toFixed(2))}
          min={0}
          step={0.1}
          onCommit={(v) => patch({ fadeOutDurationInFrames: Math.round(v * fps) })}
        />
      </Section>
      {croppable ? (
        <Section title="裁剪">
          {'crop' in item && item.crop ? (
            <div className="text-xs text-zinc-500">
              {Math.round(item.crop.left)}, {Math.round(item.crop.top)} ·{' '}
              {Math.round(item.crop.width)}×{Math.round(item.crop.height)}
            </div>
          ) : (
            <div className="text-xs text-zinc-600">未裁剪</div>
          )}
          <div className="flex gap-2">
            <button
              className="flex-1 rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
              onClick={() => setItemSelectedForCrop(item.id)}
            >
              进入裁剪
            </button>
            {'crop' in item && item.crop ? (
              <button
                className="flex-1 rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                onClick={() => patch({ crop: null } as Partial<EditorStarterItem>)}
              >
                重置
              </button>
            ) : null}
          </div>
        </Section>
      ) : null}
      {item.type === 'text' ? <TextPanel item={item} /> : null}
      {item.type === 'solid' ? (
        <Section title="颜色">
          <ColorField label="颜色" value={item.color} onChange={(v) => patch({ color: v })} />
        </Section>
      ) : null}
      {item.type === 'video' || item.type === 'audio' || item.type === 'gif' ? (
        <MediaPanel item={item} />
      ) : null}
    </>
  );
};

/** 行内数字输入（无 label 布局） */
const NumberFieldInline: React.FC<{ value: number; onCommit: (v: number) => void }> = ({
  value,
  onCommit,
}) => (
  <input
    type="number"
    className="w-full min-w-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-blue-500"
    defaultValue={value}
    key={value}
    onBlur={(e) => {
      const v = Number(e.target.value);
      if (!Number.isNaN(v) && v !== value) onCommit(v);
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    }}
  />
);

export const Inspector: React.FC = () => {
  const selectedItemIds = useEditorStore((s) => s.selectedItemIds);
  const items = useEditorStore((s) => s.undoable.items);

  const selected = selectedItemIds.map((id) => items[id]).filter(Boolean);

  if (selected.length === 0) return <CompositionPanel />;
  if (selected.length > 1) {
    return <div className="p-4 text-sm text-zinc-400">已选 {selected.length} 项</div>;
  }
  return <ItemPanel item={selected[0]} />;
};
