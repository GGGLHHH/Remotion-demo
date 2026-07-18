import type React from 'react';

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-b border-zinc-800 p-4">
    <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</div>
    <div className="flex flex-col gap-2">{children}</div>
  </div>
);

export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="w-14 shrink-0 text-xs text-zinc-400">{label}</span>
    <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
  </label>
);

export const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <Row label={label}>
    <input
      type="color"
      value={value}
      className="h-7 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-800"
      onChange={(e) => onChange(e.target.value)}
    />
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
}> = ({ label, value, min, max, step, display, onChange }) => (
  <Row label={label}>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      className="min-w-0 flex-1"
      onChange={(e) => onChange(Number(e.target.value), false)}
      onPointerUp={() => onChange(value, true)}
    />
    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-400">
      {display ?? value}
    </span>
  </Row>
);
