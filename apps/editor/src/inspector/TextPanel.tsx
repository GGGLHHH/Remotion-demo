import type React from 'react';
import { useRef, useState } from 'react';
import type { TextItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { NumberField } from './NumberField';
import { ColorField, Row, Section } from './fields';
import { FontPicker } from './FontPicker';

/** 首个强方向字符判断 RTL（阿拉伯/希伯来等区段） */
export const detectDirection = (text: string): 'ltr' | 'rtl' => {
  const strong = text.match(/[֐-޿ࢠ-ࣿיִ-﷽ﹰ-ﻼ]|[A-Za-z一-鿿]/);
  if (!strong) return 'ltr';
  return /[A-Za-z一-鿿]/.test(strong[0]) ? 'ltr' : 'rtl';
};

const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

export const TextPanel: React.FC<{ item: TextItem }> = ({ item }) => {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);
  const previewItemStyle = useEditorStore((s) => s.previewItemStyle);
  const cancelItemStylePreview = useEditorStore((s) => s.cancelItemStylePreview);
  const commitPending = useEditorStore((s) => s.commitPending);
  const [weightOpen, setWeightOpen] = useState(false);
  // 悬停预览会把 item.fontStyle 改成预览值，点击时需要预览前的真实值来算切换目标
  const italicBase = useRef<'normal' | 'italic' | null>(null);
  const patch = (partial: Partial<TextItem>, commit = true) =>
    updateUndoable(
      (s) => {
        const cur = s.items[item.id];
        if (!cur || cur.type !== 'text') return s;
        return { ...s, items: { ...s.items, [item.id]: { ...cur, ...partial } } };
      },
      { commit },
    );

  return (
    <>
      <Section title="文本">
        <textarea
          key={item.id}
          className="min-h-16 w-full resize-y rounded border border-zinc-700 bg-zinc-800 p-2 text-xs outline-none focus:border-blue-500"
          style={{ fieldSizing: 'content' } as React.CSSProperties}
          defaultValue={item.text}
          onBlur={(e) => {
            const text = e.target.value;
            if (text !== item.text) patch({ text, direction: detectDirection(text) });
          }}
        />
        <Row label="字体">
          <FontPicker itemId={item.id} value={item.fontFamily} onCommit={(f) => patch({ fontFamily: f })} />
        </Row>
        <Row label="字重">
          {/* 自定义下拉：悬停即在画布实时预览字重（commit:false），点击才提交 */}
          <div className="relative w-full min-w-0">
            <button
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-left text-xs hover:border-zinc-500"
              onClick={() => setWeightOpen((o) => !o)}
            >
              {item.fontWeight}
            </button>
            {weightOpen ? (
              <div
                className="absolute z-30 mt-1 w-full rounded border border-zinc-700 bg-zinc-900 shadow-xl"
                onMouseLeave={cancelItemStylePreview}
              >
                {WEIGHTS.map((w) => (
                  <button
                    key={w}
                    className={`block w-full px-2 py-1 text-left text-xs hover:bg-zinc-800 ${
                      w === item.fontWeight ? 'text-blue-400' : ''
                    }`}
                    style={{ fontFamily: item.fontFamily, fontWeight: w }}
                    onMouseEnter={() => previewItemStyle(item.id, { fontWeight: w })}
                    onClick={() => {
                      previewItemStyle(item.id, { fontWeight: w });
                      commitPending();
                      setWeightOpen(false);
                    }}
                  >
                    {w}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className={`rounded border px-2 py-1 text-xs italic ${
              item.fontStyle === 'italic' ? 'border-blue-500 text-blue-400' : 'border-zinc-700'
            }`}
            onMouseEnter={() => {
              italicBase.current = item.fontStyle;
              previewItemStyle(item.id, {
                fontStyle: item.fontStyle === 'italic' ? 'normal' : 'italic',
              });
            }}
            onMouseLeave={() => {
              italicBase.current = null;
              cancelItemStylePreview();
            }}
            onClick={() => {
              const base = italicBase.current ?? item.fontStyle;
              previewItemStyle(item.id, {
                fontStyle: base === 'italic' ? 'normal' : 'italic',
              });
              commitPending();
              italicBase.current = null;
            }}
          >
            I
          </button>
        </Row>
        <NumberField label="字号" value={item.fontSize} min={4} max={800} onCommit={(v) => patch({ fontSize: v })} />
        <ColorField label="颜色" value={item.color} onChange={(v) => patch({ color: v })} />
        <NumberField
          label="描边宽"
          value={item.strokeWidth}
          min={0}
          max={40}
          onCommit={(v) => patch({ strokeWidth: v })}
        />
        {item.strokeWidth > 0 ? (
          <ColorField label="描边色" value={item.strokeColor} onChange={(v) => patch({ strokeColor: v })} />
        ) : null}
        <NumberField
          label="行高"
          value={item.lineHeight}
          min={0.5}
          max={5}
          step={0.1}
          onCommit={(v) => patch({ lineHeight: v })}
        />
        <NumberField
          label="字距"
          value={item.letterSpacing}
          min={-10}
          max={50}
          onCommit={(v) => patch({ letterSpacing: v })}
        />
        <Row label="对齐">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              className={`flex-1 rounded border px-2 py-1 text-xs ${
                item.textAlign === a ? 'border-blue-500 text-blue-400' : 'border-zinc-700'
              }`}
              onClick={() => patch({ textAlign: a })}
            >
              {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
            </button>
          ))}
        </Row>
        <Row label="方向">
          {(['ltr', 'rtl'] as const).map((d) => (
            <button
              key={d}
              className={`flex-1 rounded border px-2 py-1 text-xs uppercase ${
                item.direction === d ? 'border-blue-500 text-blue-400' : 'border-zinc-700'
              }`}
              onClick={() => patch({ direction: d })}
            >
              {d}
            </button>
          ))}
        </Row>
      </Section>
      <Section title="文字背景">
        <Row label="启用">
          <input
            type="checkbox"
            checked={item.backgroundColor !== null}
            onChange={(e) => patch({ backgroundColor: e.target.checked ? '#000000' : null })}
          />
        </Row>
        {item.backgroundColor !== null ? (
          <>
            <ColorField
              label="背景色"
              value={item.backgroundColor}
              onChange={(v) => patch({ backgroundColor: v })}
            />
            <NumberField
              label="内边距"
              value={item.backgroundPadding}
              min={0}
              onCommit={(v) => patch({ backgroundPadding: v })}
            />
            <NumberField
              label="圆角"
              value={item.backgroundBorderRadius}
              min={0}
              onCommit={(v) => patch({ backgroundBorderRadius: v })}
            />
          </>
        ) : null}
      </Section>
    </>
  );
};
