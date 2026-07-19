import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { ensureFontLoaded, listFontFamilies } from '@gedatou/shared/composition';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEditorStore } from '../state/store';

/** 字体选择器：shadcn Popover + Command，搜索 + 悬停画布实时预览。
 * 下拉项用各自字体渲染（官方 FEATURE_FONT_FAMILY_DROPDOWN_RENDER_IN_FONT）：
 * IntersectionObserver 在行进入可视区时才懒加载该字体，加载完成前显示回退字体。
 * 过滤保持手动（shouldFilter=false）：全量字体上千，需截前 100 行控制 DOM 数量，
 * 且 cmdk 内置模糊评分对字体名易误排序；query 变化时重挂 observer 覆盖新出现的行 */
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
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFontHoverPreview(null); // 关闭（点外部/Esc）时清掉悬停预览
      }}
    >
      <PopoverTrigger
        className="flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2 text-left text-xs transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
        style={{ fontFamily: value }}
      >
        <span className="truncate">{value}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      {/* 官方行为：字体弹层从触发器左侧弹出 */}
      <PopoverContent side="left" align="start" className="w-(--anchor-width) p-0">
        <Command shouldFilter={false} className="rounded-lg!">
          <CommandInput
            autoFocus
            placeholder="搜索字体…"
            className="text-xs"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList
            ref={listRef}
            className="max-h-64"
            onMouseLeave={() => setFontHoverPreview(null)}
          >
            <CommandEmpty>无匹配字体</CommandEmpty>
            {families.map((f) => (
              <CommandItem
                key={f}
                value={f}
                data-font={f}
                data-checked={f === value || undefined}
                className={f === value ? 'bg-accent text-accent-foreground' : ''}
                style={{ fontFamily: f }}
                onMouseEnter={() => setFontHoverPreview({ itemId, fontFamily: f })}
                onSelect={() => {
                  onCommit(f);
                  setFontHoverPreview(null);
                  setOpen(false);
                }}
              >
                {f}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
