import type React from 'react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

/** 数字输入：Enter/blur 提交（一条撤销记录），非法输入回退显示值 */
export const NumberField: React.FC<{
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}> = ({ label, value, onCommit, min, max, step }) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const parsed = Number(text);
    if (Number.isNaN(parsed)) {
      setText(String(value));
      return;
    }
    let v = parsed;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== value) onCommit(v);
    setText(String(v));
  };

  // 保持 <label> 包裹 input：e2e 依赖 label:has-text(...) input 选择器
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        className="h-7 px-2 text-right text-xs tabular-nums md:text-xs"
        value={text}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
};
