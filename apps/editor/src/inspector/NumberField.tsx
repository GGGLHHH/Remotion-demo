import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Input } from '../components/ui/input';
import { useEditorApi } from '../state/context';

/** 按步进取整，消除浮点噪音 */
const snap = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(4));

/**
 * 数字输入（官方样式）：
 * - inline：label 作为灰色字母前缀渲染在输入框内（X/Y/W/H）
 * - 否则：label 在上方，可选 icon 作为输入框内前缀
 * - label/前缀均为拖拽微调手柄（cursor-ew-resize，水平拖动实时改值，一次拖动一条撤销）
 * - 输入框内 Enter/blur 提交（committing=true，一条撤销记录）
 */
export const NumberField: React.FC<{
  label: string;
  inline?: boolean;
  icon?: LucideIcon;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  /** committing=false 为拖拽中的实时值（调用方应 commit:false）；=true 为一次性提交 */
  onChange: (value: number, committing: boolean) => void;
}> = ({ label, inline, icon: Icon, value, min, max, step = 1, className, onChange }) => {
  const editorApi = useEditorApi();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const scrub = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  // 拖拽结束后的 click 会触发 label 激活聚焦输入框，需吞掉（否则全局撤销快捷键被输入框拦截）
  const suppressClick = useRef(false);

  const clamp = (v: number) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const commit = () => {
    const parsed = Number(text);
    if (Number.isNaN(parsed)) {
      setText(String(value));
      return;
    }
    const v = clamp(parsed);
    if (v !== value) onChange(v, true);
    setText(String(v));
  };

  // 拖拽微调：pointer capture 在手柄元素上，move 时 commit:false 实时更新，松手 commitPending
  const scrubHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault(); // 阻止 label 默认聚焦与选字
      e.currentTarget.setPointerCapture(e.pointerId);
      scrub.current = { x: e.clientX, base: value, moved: false };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = scrub.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (!s.moved && Math.abs(dx) < 2) return;
      s.moved = true;
      const v = clamp(snap(s.base + dx * step, step));
      setText(String(v));
      onChange(v, false);
    },
    onPointerUp: () => {
      if (scrub.current?.moved) {
        editorApi.getState().commitPending();
        suppressClick.current = true;
      }
      scrub.current = null;
    },
    onPointerCancel: () => {
      scrub.current = null;
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (suppressClick.current) {
        e.preventDefault();
        suppressClick.current = false;
      }
    },
  };
  const handleCls = 'cursor-ew-resize touch-none select-none';

  const input = (extraCls: string) => (
    <Input
      type="number"
      className={`h-7 pr-1 text-right text-xs tabular-nums md:text-xs ${extraCls}`}
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );

  // e2e 依赖 label:has-text(...) input 结构，label 必须包裹 input
  if (inline) {
    return (
      <label className={`relative flex min-w-0 items-center ${className ?? ''}`}>
        <span
          {...scrubHandlers}
          className={`absolute left-2 z-10 text-xs text-muted-foreground ${handleCls}`}
        >
          {label}
        </span>
        {input('pl-6')}
      </label>
    );
  }

  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}>
      <span {...scrubHandlers} className={`w-fit text-xs text-muted-foreground ${handleCls}`}>
        {label}
      </span>
      <div className="relative flex items-center">
        {Icon ? (
          <span {...scrubHandlers} className={`absolute left-2 z-10 text-muted-foreground ${handleCls}`}>
            <Icon className="size-3.5" />
          </span>
        ) : null}
        {input(Icon ? 'pl-7' : '')}
      </div>
    </label>
  );
};
