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

  // 编辑期间隐藏底层文本项（opacity 预览，不进撤销栈），避免 textarea 后面重影
  useEffect(() => {
    if (!itemId) return;
    const store = useEditorStore.getState();
    store.previewItemStyle(itemId, { opacity: 0 });
    return () => store.cancelItemStylePreview();
  }, [itemId]);

  if (!item || item.type !== 'text') return null;

  const commit = (text: string) => {
    const store = useEditorStore.getState();
    // 先还原隐藏预览，再提交文本改动（否则 opacity:0 会被一起提交）
    store.cancelItemStylePreview();
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
