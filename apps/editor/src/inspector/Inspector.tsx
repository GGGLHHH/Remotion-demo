import type React from 'react';
import type { EditorStarterItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { NumberField } from './NumberField';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-b border-zinc-800 p-4">
    <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</div>
    <div className="flex flex-col gap-2">{children}</div>
  </div>
);

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

const ItemPanel: React.FC<{ item: EditorStarterItem }> = ({ item }) => {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);

  const patch = (partial: Partial<EditorStarterItem>) => {
    updateUndoable((s) => {
      const cur = s.items[item.id];
      if (!cur) return s;
      return { ...s, items: { ...s.items, [item.id]: { ...cur, ...partial } as EditorStarterItem } };
    });
  };

  return (
    <>
      <Section title={`${item.type} 属性`}>
        <NumberField label="X" value={item.left} onCommit={(v) => patch({ left: v })} />
        <NumberField label="Y" value={item.top} onCommit={(v) => patch({ top: v })} />
        <NumberField label="宽" value={item.width} min={20} onCommit={(v) => patch({ width: v })} />
        <NumberField label="高" value={item.height} min={20} onCommit={(v) => patch({ height: v })} />
        <NumberField
          label="旋转°"
          value={item.rotation}
          step={1}
          onCommit={(v) => patch({ rotation: v })}
        />
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
      </Section>
      {item.type === 'text' ? (
        <Section title="文本">
          <textarea
            className="min-h-16 w-full resize-y rounded border border-zinc-700 bg-zinc-800 p-2 text-xs outline-none focus:border-blue-500"
            defaultValue={item.text}
            key={item.id}
            onBlur={(e) => {
              if (e.target.value !== item.text) patch({ text: e.target.value });
            }}
          />
        </Section>
      ) : null}
      {item.type === 'solid' ? (
        <Section title="颜色">
          <input
            type="color"
            value={item.color}
            className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-800"
            onChange={(e) => patch({ color: e.target.value })}
          />
        </Section>
      ) : null}
    </>
  );
};

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
