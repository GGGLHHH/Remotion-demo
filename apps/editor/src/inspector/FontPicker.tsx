import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import { ensureFontLoaded, listFontFamilies } from '@editor/shared/composition';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '../state/store';

/** 字体选择器：搜索 + 下拉 + 悬停画布实时预览。
 * 下拉项用各自字体渲染（官方 FEATURE_FONT_FAMILY_DROPDOWN_RENDER_IN_FONT）：
 * IntersectionObserver 在行进入可视区时才懒加载该字体，加载完成前显示回退字体。
 * 悬停预览依赖每行的 mouseenter 回调，保持自定义下拉，仅按 shadcn popover 风格改样式 */
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
    <div className="relative w-full min-w-0">
      <button
        className="flex h-7 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2 text-left text-xs transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
        style={{ fontFamily: value }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{value}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="relative border-b border-border">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="搜索字体…"
              className="h-8 rounded-none border-0 bg-transparent pl-7 text-xs focus-visible:ring-0 md:text-xs dark:bg-transparent"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {/* e2e 依赖 div.max-h-64 button 选择器，容器 class 保持 */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto p-1"
            onMouseLeave={() => setFontHoverPreview(null)}
          >
            {families.map((f) => (
              <button
                key={f}
                data-font={f}
                className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                  f === value ? 'bg-accent text-accent-foreground' : ''
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
