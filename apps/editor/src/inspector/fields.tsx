import type React from 'react';
import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useEditorStore } from '../state/store';

/**
 * 面板分区。collapsible 时标题为整行折叠按钮（官方样式，右侧 ▼/▶ 箭头）；
 * 否则为静态标题（空状态面板：画布/时长/导出）。
 */
export const Section: React.FC<{
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, collapsible, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  if (!collapsible) {
    return (
      <div className="border-b border-border p-4">
        <div className="mb-3 text-sm font-semibold">{title}</div>
        <div className="flex flex-col gap-2.5">{children}</div>
      </div>
    );
  }
  return (
    <div className="border-b border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold transition-colors hover:bg-accent/50"
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? (
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-3.5 text-muted-foreground" />
        )}
      </button>
      {open ? <div className="flex flex-col gap-2.5 px-4 pb-4">{children}</div> : null}
    </div>
  );
};

// 保持 <label> 结构：e2e 依赖 label:has-text(...) 选择器
export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
    <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
  </label>
);

/** 颜色：label 在上，裸原生 color input 色板（官方 50x27 样式，无十六进制读数） */
export const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <label className="flex flex-col gap-1">
    <span className="w-fit text-xs text-muted-foreground">{label}</span>
    <input
      type="color"
      value={value}
      className="h-7 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0"
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);

/**
 * 滑杆（官方样式）：label 在上，滑杆 + 右侧纯文本读数。
 * 拖动中 committing=false（调用方应 commit:false 更新 store，画布实时可见）；
 * 松手 committing=true 回调后自动 commitPending —— 一次拖动一条撤销记录。
 */
export const SliderField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (v: number, committing: boolean) => void;
}> = ({ label, value, min, max, step, display, onChange }) => {
  // 拖动期间用本地值驱动滑块，未提交到 store 也能跟手
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <label className="flex flex-col gap-1">
      <span className="w-fit text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
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
            useEditorStore.getState().commitPending();
          }}
        />
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {display ?? drag ?? value}
        </span>
      </div>
    </label>
  );
};

/** 淡入/淡出滑杆对：0 → 条目时长（秒），步进 0.1，读数 '0.0s'（官方 Fade 控件） */
export const FadeSliders: React.FC<{
  fadeInFrames: number;
  fadeOutFrames: number;
  durationInFrames: number;
  fps: number;
  /** 始终 commit:false 更新，松手由 SliderField 自动 commitPending */
  onPatch: (p: { fadeInDurationInFrames?: number; fadeOutDurationInFrames?: number }) => void;
}> = ({ fadeInFrames, fadeOutFrames, durationInFrames, fps, onPatch }) => {
  const maxS = Math.max(0.1, durationInFrames / fps);
  return (
    <>
      <SliderField
        label="淡入s"
        value={fadeInFrames / fps}
        min={0}
        max={maxS}
        step={0.1}
        display={`${(fadeInFrames / fps).toFixed(1)}s`}
        onChange={(v) => onPatch({ fadeInDurationInFrames: Math.round(v * fps) })}
      />
      <SliderField
        label="淡出s"
        value={fadeOutFrames / fps}
        min={0}
        max={maxS}
        step={0.1}
        display={`${(fadeOutFrames / fps).toFixed(1)}s`}
        onChange={(v) => onPatch({ fadeOutDurationInFrames: Math.round(v * fps) })}
      />
    </>
  );
};
