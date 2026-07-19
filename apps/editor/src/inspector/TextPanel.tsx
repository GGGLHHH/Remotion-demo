import type React from 'react';
import { useRef, useState } from 'react';
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ChevronDownIcon,
  ItalicIcon,
} from 'lucide-react';
import type { TextItem } from '@editor/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '../state/store';
import { NumberField } from './NumberField';
import { ColorField, Row, Section } from './fields';
import { FontPicker } from './FontPicker';

/** 首个强方向字符判断 RTL（阿拉伯/希伯来等区段） */
export const detectDirection = (text: string): 'ltr' | 'rtl' => {
  const strong = text.match(/[֐-޿ࢠ-ࣿיִ-﷽ﹰ-ﻼ]|[A-Za-z一-鿿]/);
  if (!strong) return 'ltr';
  return /[A-Za-z一-鿿]/.test(strong[0]) ? 'ltr' : 'rtl';
};

const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

const ALIGN_ICONS = { left: AlignLeftIcon, center: AlignCenterIcon, right: AlignRightIcon } as const;

/** 选中态按钮高亮（outline Button 之上叠加） */
const activeCls = (active: boolean) => (active ? 'border-primary text-primary' : '');

export const TextPanel: React.FC<{ item: TextItem }> = ({ item }) => {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);
  const previewItemStyle = useEditorStore((s) => s.previewItemStyle);
  const cancelItemStylePreview = useEditorStore((s) => s.cancelItemStylePreview);
  const commitPending = useEditorStore((s) => s.commitPending);
  const [weightOpen, setWeightOpen] = useState(false);
  // 悬停预览会把 item.fontStyle 改成预览值，点击时需要预览前的真实值来算切换目标
  const italicBase = useRef<'normal' | 'italic' | null>(null);
  const patch = (partial: Partial<TextItem>, commit = true) =>
    updateUndoable(
      (s) => {
        const cur = s.items[item.id];
        if (!cur || cur.type !== 'text') return s;
        return { ...s, items: { ...s.items, [item.id]: { ...cur, ...partial } } };
      },
      { commit },
    );

  return (
    <>
      <Section title="文本">
        <Textarea
          key={item.id}
          className="min-h-16 resize-y text-xs md:text-xs"
          defaultValue={item.text}
          onBlur={(e) => {
            const text = e.target.value;
            if (text !== item.text) patch({ text, direction: detectDirection(text) });
          }}
        />
        <Row label="字体">
          <FontPicker itemId={item.id} value={item.fontFamily} onCommit={(f) => patch({ fontFamily: f })} />
        </Row>
        <Row label="字重">
          {/* Popover + Command 下拉：悬停即在画布实时预览字重（commit:false），点击才提交；
              shadcn Select 无法逐项 hover 回调，故用 CommandItem 挂 onMouseEnter */}
          <Popover
            open={weightOpen}
            onOpenChange={(o) => {
              setWeightOpen(o);
              if (!o) cancelItemStylePreview(); // 关闭（点外部/Esc）时撤掉悬停预览
            }}
          >
            <PopoverTrigger className="flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2 text-left text-xs transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50">
              {item.fontWeight}
              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--anchor-width) p-0">
              <Command className="rounded-lg!">
                <CommandList onMouseLeave={cancelItemStylePreview}>
                  {WEIGHTS.map((w) => (
                    <CommandItem
                      key={w}
                      value={w}
                      data-checked={w === item.fontWeight || undefined}
                      className={`py-1 text-xs ${
                        w === item.fontWeight ? 'bg-accent text-accent-foreground' : ''
                      }`}
                      style={{ fontFamily: item.fontFamily, fontWeight: w }}
                      onMouseEnter={() => previewItemStyle(item.id, { fontWeight: w })}
                      onSelect={() => {
                        previewItemStyle(item.id, { fontWeight: w });
                        commitPending();
                        setWeightOpen(false);
                      }}
                    >
                      {w}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className={activeCls(item.fontStyle === 'italic')}
                  onMouseEnter={() => {
                    italicBase.current = item.fontStyle;
                    previewItemStyle(item.id, {
                      fontStyle: item.fontStyle === 'italic' ? 'normal' : 'italic',
                    });
                  }}
                  onMouseLeave={() => {
                    italicBase.current = null;
                    cancelItemStylePreview();
                  }}
                  onClick={() => {
                    const base = italicBase.current ?? item.fontStyle;
                    previewItemStyle(item.id, {
                      fontStyle: base === 'italic' ? 'normal' : 'italic',
                    });
                    commitPending();
                    italicBase.current = null;
                  }}
                >
                  <ItalicIcon />
                </Button>
              }
            />
            <TooltipContent>斜体</TooltipContent>
          </Tooltip>
        </Row>
        <NumberField label="字号" value={item.fontSize} min={4} max={800} onCommit={(v) => patch({ fontSize: v })} />
        <ColorField label="颜色" value={item.color} onChange={(v) => patch({ color: v })} />
        <NumberField
          label="描边宽"
          value={item.strokeWidth}
          min={0}
          max={40}
          onCommit={(v) => patch({ strokeWidth: v })}
        />
        {item.strokeWidth > 0 ? (
          <ColorField label="描边色" value={item.strokeColor} onChange={(v) => patch({ strokeColor: v })} />
        ) : null}
        <NumberField
          label="行高"
          value={item.lineHeight}
          min={0.5}
          max={5}
          step={0.1}
          onCommit={(v) => patch({ lineHeight: v })}
        />
        <NumberField
          label="字距"
          value={item.letterSpacing}
          min={-10}
          max={50}
          onCommit={(v) => patch({ letterSpacing: v })}
        />
        {/* e2e 依赖 label:has-text("对齐") 下 button 顺序：left 在首位 */}
        <Row label="对齐">
          {(['left', 'center', 'right'] as const).map((a) => {
            const Icon = ALIGN_ICONS[a];
            return (
              <Button
                key={a}
                variant="outline"
                size="icon-sm"
                className={`flex-1 ${activeCls(item.textAlign === a)}`}
                onClick={() => patch({ textAlign: a })}
              >
                <Icon />
              </Button>
            );
          })}
        </Row>
        <Row label="方向">
          {(['ltr', 'rtl'] as const).map((d) => (
            <Button
              key={d}
              variant="outline"
              size="sm"
              className={`flex-1 uppercase ${activeCls(item.direction === d)}`}
              onClick={() => patch({ direction: d })}
            >
              {d}
            </Button>
          ))}
        </Row>
      </Section>
      <Section title="文字背景">
        <Row label="启用">
          <Checkbox
            checked={item.backgroundColor !== null}
            onCheckedChange={(checked) => patch({ backgroundColor: checked ? '#000000' : null })}
          />
        </Row>
        {item.backgroundColor !== null ? (
          <>
            <ColorField
              label="背景色"
              value={item.backgroundColor}
              onChange={(v) => patch({ backgroundColor: v })}
            />
            <NumberField
              label="内边距"
              value={item.backgroundPadding}
              min={0}
              onCommit={(v) => patch({ backgroundPadding: v })}
            />
            <NumberField
              label="圆角"
              value={item.backgroundBorderRadius}
              min={0}
              onCommit={(v) => patch({ backgroundBorderRadius: v })}
            />
          </>
        ) : null}
      </Section>
    </>
  );
};
