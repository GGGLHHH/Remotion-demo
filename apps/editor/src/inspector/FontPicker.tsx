import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { ensureFontLoaded, listFontFamilies } from '@editor/shared/composition';
import { useEditorStore } from '../state/store';

/** 字体选择器：搜索 + 下拉 + 悬停画布实时预览。
 * ponytail: 下拉项悬停后才加载该字体（官方用子集字体文件预渲染每一项；需要时再升级） */
export const FontPicker: React.FC<{
  itemId: string;
  value: string;
  onCommit: (family: string) => void;
}> = ({ itemId, value, onCommit }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const setFontHoverPreview = useEditorStore((s) => s.setFontHoverPreview);
  const loadedRef = useRef(new Set<string>());
  const [, bump] = useState(0);

  const families = useMemo(() => {
    const all = listFontFamilies();
    const q = query.trim().toLowerCase();
    return (q ? all.filter((f) => f.toLowerCase().includes(q)) : all).slice(0, 100);
  }, [query]);

  const hover = (family: string) => {
    setFontHoverPreview({ itemId, fontFamily: family });
    if (!loadedRef.current.has(family)) {
      void ensureFontLoaded(family).then(() => {
        loadedRef.current.add(family);
        bump((n) => n + 1);
      });
    }
  };

  return (
    <div className="relative">
      <button
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-left text-xs hover:border-zinc-500"
        style={{ fontFamily: value }}
        onClick={() => setOpen((o) => !o)}
      >
        {value}
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded border border-zinc-700 bg-zinc-900 shadow-xl">
          <input
            autoFocus
            placeholder="搜索字体…"
            className="w-full border-b border-zinc-700 bg-transparent px-2 py-1.5 text-xs outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="max-h-64 overflow-y-auto"
            onMouseLeave={() => setFontHoverPreview(null)}
          >
            {families.map((f) => (
              <button
                key={f}
                className={`block w-full truncate px-2 py-1.5 text-left text-sm hover:bg-zinc-800 ${
                  f === value ? 'text-blue-400' : ''
                }`}
                style={{ fontFamily: loadedRef.current.has(f) ? f : undefined }}
                onMouseEnter={() => hover(f)}
                onClick={() => {
                  onCommit(f);
                  setFontHoverPreview(null);
                  setOpen(false);
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
