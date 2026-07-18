import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureFontLoaded, listFontFamilies } from '@editor/shared/composition';
import { useEditorStore } from '../state/store';

/** 字体选择器：搜索 + 下拉 + 悬停画布实时预览。
 * 下拉项用各自字体渲染（官方 FEATURE_FONT_FAMILY_DROPDOWN_RENDER_IN_FONT）：
 * IntersectionObserver 在行进入可视区时才懒加载该字体，加载完成前显示回退字体 */
export const FontPicker: React.FC<{
  itemId: string;
  value: string;
  onCommit: (family: string) => void;
}> = ({ itemId, value, onCommit }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const setFontHoverPreview = useEditorStore((s) => s.setFontHoverPreview);
  const listRef = useRef<HTMLDivElement>(null);

  const families = useMemo(() => {
    const all = listFontFamilies();
    const q = query.trim().toLowerCase();
    return (q ? all.filter((f) => f.toLowerCase().includes(q)) : all).slice(0, 100);
  }, [query]);

  // 可见行才加载字体（ensureFontLoaded 幂等，重复调用返回缓存 Promise）；
  // 字体就绪后 FontFace 生效，浏览器自动按新字体重排，无需手动触发渲染
  useEffect(() => {
    if (!open) return;
    const root = listRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          void ensureFontLoaded((e.target as HTMLElement).dataset.font ?? '');
        }
      },
      { root, rootMargin: '100px' },
    );
    for (const el of root.querySelectorAll<HTMLElement>('[data-font]')) io.observe(el);
    return () => io.disconnect();
  }, [open, families]);

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
            ref={listRef}
            className="max-h-64 overflow-y-auto"
            onMouseLeave={() => setFontHoverPreview(null)}
          >
            {families.map((f) => (
              <button
                key={f}
                data-font={f}
                className={`block w-full truncate px-2 py-1.5 text-left text-sm hover:bg-zinc-800 ${
                  f === value ? 'text-blue-400' : ''
                }`}
                style={{ fontFamily: f }}
                onMouseEnter={() => setFontHoverPreview({ itemId, fontFamily: f })}
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
