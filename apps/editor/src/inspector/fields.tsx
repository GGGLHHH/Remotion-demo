import type React from 'react';
import { useState } from 'react';
import { Slider } from '@/components/ui/slider';

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-b border-border p-4">
    <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
    <div className="flex flex-col gap-2">{children}</div>
  </div>
);

// 保持 <label> 结构：e2e 依赖 label:has-text(...) 选择器
export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
    <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
  </label>
);

// 原生 color input 保留（体验最好），外面套 shadcn 风格的色板行 + 十六进制读数
export const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <Row label={label}>
    <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-transparent px-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      <input
        type="color"
        value={value}
        className="h-4 w-8 shrink-0 cursor-pointer appearance-none rounded-sm border-0 bg-transparent p-0 outline-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0"
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="truncate text-xs uppercase tabular-nums text-muted-foreground">{value}</span>
    </div>
  </Row>
);

export const SliderField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  /** 拖动中 commit:false，松手提交 */
  onChange: (v: number, committing: boolean) => void;
}> = ({ label, value, min, max, step, display, onChange }) => {
  // 拖动期间用本地值驱动滑块，未提交到 store 也能跟手
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <Row label={label}>
      <Slider
        className="min-w-0 flex-1"
        min={min}
        max={max}
        step={step}
        value={[drag ?? value]}
        onValueChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          setDrag(n);
          onChange(n, false);
        }}
        onValueCommitted={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          setDrag(null);
          onChange(n, true);
        }}
      />
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {display ?? value}
      </span>
    </Row>
  );
};
