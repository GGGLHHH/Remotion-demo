import type React from 'react';
import { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/store';
import { detectDirection } from '../inspector/TextPanel';

/** 画布行内文本编辑：覆盖一个与文本项同位置同样式的 textarea */
export const TextEditOverlay: React.FC<{ scale: number }> = ({ scale }) => {
  const itemId = useEditorStore((s) => s.textItemEditing);
  const item = useEditorStore((s) => (itemId ? s.undoable.items[itemId] : null));
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [itemId]);

  if (!item || item.type !== 'text') return null;

  const commit = (text: string) => {
    const store = useEditorStore.getState();
    if (text !== item.text) {
      store.updateUndoable((s) => {
        const cur = s.items[item.id];
        if (!cur || cur.type !== 'text') return s;
        return {
          ...s,
          items: { ...s.items, [item.id]: { ...cur, text, direction: detectDirection(text) } },
        };
      });
    }
    store.setTextItemEditing(null);
  };

  return (
    <textarea
      ref={ref}
      className="absolute z-30 resize-none border border-blue-500 bg-transparent outline-none"
      style={{
        left: item.left * scale,
        top: item.top * scale,
        width: item.width * scale,
        height: item.height * scale,
        rotate: `${item.rotation}deg`,
        fontFamily: item.fontFamily,
        fontWeight: item.fontWeight,
        fontStyle: item.fontStyle,
        fontSize: item.fontSize * scale,
        color: item.color,
        lineHeight: item.lineHeight,
        letterSpacing: item.letterSpacing * scale,
        textAlign: item.textAlign,
        direction: item.direction,
      }}
      defaultValue={item.text}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
};
