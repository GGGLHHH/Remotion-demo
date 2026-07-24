import type React from 'react';
import { useState } from 'react';
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ChevronDownIcon,
  MoveHorizontalIcon,
  MoveVerticalIcon,
  PenLineIcon,
  PilcrowLeftIcon,
  PilcrowRightIcon,
  SquareRoundCornerIcon,
  TypeIcon,
} from 'lucide-react';
import type { TextItem } from '@gedatou/shared';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Command, CommandItem, CommandList } from '../../components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Textarea } from '../../components/ui/textarea';
import { useEditor } from '../../state/context';
import { useT } from '../../lib/i18n';
import { NumberField } from '../NumberField';
import { ColorField, Row, Section } from '../fields';
import { FontPicker } from '../FontPicker';

/** 首个强方向字符判断 RTL（阿拉伯/希伯来等区段） */
export const detectDirection = (text: string): 'ltr' | 'rtl' => {
  const strong = text.match(/[֐-޿ࢠ-ࣿיִ-﷽ﹰ-ﻼ]|[A-Za-z一-鿿]/);
  if (!strong) return 'ltr';
  return /[A-Za-z一-鿿]/.test(strong[0]) ? 'ltr' : 'rtl';
};

/** 官方字重命名（Thin…Black + Italic 变体），单下拉同时携带 fontWeight 与 fontStyle */
const WEIGHT_NAMES: [string, string][] = [
  ['100', 'Thin'],
  ['200', 'Extra Light'],
  ['300', 'Light'],
  ['400', 'Regular'],
  ['500', 'Medium'],
  ['600', 'Semi Bold'],
  ['700', 'Bold'],
  ['800', 'Extra Bold'],
  ['900', 'Black'],
];
const WEIGHT_OPTIONS = (['normal', 'italic'] as const).flatMap((style) =>
  WEIGHT_NAMES.map(([weight, name]) => ({
    weight,
    style,
    label: style === 'italic' ? (weight === '400' ? 'Italic' : `Italic ${name}`) : name,
  })),
);

const weightLabel = (weight: string, style: 'normal' | 'italic'): string =>
  WEIGHT_OPTIONS.find((o) => o.weight === weight && o.style === style)?.label ??
  `${style === 'italic' ? 'Italic ' : ''}${weight}`;

/** 选中态按钮高亮（outline Button 之上叠加） */
const activeCls = (active: boolean) => (active ? 'border-primary text-primary' : '');
/** 拼接式按钮组（官方 joined segmented group） */
const groupCls = (i: number, len: number) =>
  `flex-1 rounded-none ${i === 0 ? 'rounded-l-lg' : '-ml-px'} ${i === len - 1 ? 'rounded-r-lg' : ''}`;

const ALIGN_ICONS = { left: AlignLeftIcon, center: AlignCenterIcon, right: AlignRightIcon } as const;
const DIR_ICONS = { ltr: PilcrowLeftIcon, rtl: PilcrowRightIcon } as const;

type PatchFn = (partial: Partial<TextItem>, commit?: boolean) => void;

const usePatch = (itemId: string): PatchFn => {
  const updateUndoable = useEditor((s) => s.updateUndoable);
  return (partial, commit = true) =>
    updateUndoable(
      (s) => {
        const cur = s.items[itemId];
        if (!cur || cur.type !== 'text') return s;
        return { ...s, items: { ...s.items, [itemId]: { ...cur, ...partial } } };
      },
      { commit },
    );
};

/** 排版（官方 Typography）：字体/字重/字号/行高/字距/文本/对齐/方向 */
export const TypographySection: React.FC<{ item: TextItem }> = ({ item }) => {
  const previewItemStyle = useEditor((s) => s.previewItemStyle);
  const cancelItemStylePreview = useEditor((s) => s.cancelItemStylePreview);
  const commitPending = useEditor((s) => s.commitPending);
  const [weightOpen, setWeightOpen] = useState(false);
  const patch = usePatch(item.id);
  const t = useT();

  return (
    <Section title={t('textPanel.typography')} collapsible defaultOpen>
      <Row label={t('textPanel.fontFamily')}>
        <FontPicker itemId={item.id} value={item.fontFamily} onCommit={(f) => patch({ fontFamily: f })} />
      </Row>
      <Row label={t('textPanel.fontWeight')}>
        {/* Popover + Command 下拉：悬停即在画布实时预览字重/斜体（commit:false），点击才提交；
            shadcn Select 无法逐项 hover 回调，故用 CommandItem 挂 onMouseEnter */}
        <Popover
          open={weightOpen}
          onOpenChange={(o) => {
            setWeightOpen(o);
            if (!o) cancelItemStylePreview(); // 关闭（点外部/Esc）时撤掉悬停预览
          }}
        >
          <PopoverTrigger className="flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2 text-left text-xs transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50">
            <span className="truncate">{weightLabel(item.fontWeight, item.fontStyle)}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-(--anchor-width) p-0">
            <Command className="rounded-lg!">
              <CommandList className="max-h-64" onMouseLeave={cancelItemStylePreview}>
                {WEIGHT_OPTIONS.map((o) => {
                  const checked = o.weight === item.fontWeight && o.style === item.fontStyle;
                  return (
                    <CommandItem
                      key={o.label}
                      value={o.label}
                      data-checked={checked || undefined}
                      className={`py-1 text-xs ${checked ? 'bg-accent text-accent-foreground' : ''}`}
                      style={{ fontFamily: item.fontFamily, fontWeight: o.weight, fontStyle: o.style }}
                      onMouseEnter={() =>
                        previewItemStyle(item.id, { fontWeight: o.weight, fontStyle: o.style })
                      }
                      onSelect={() => {
                        previewItemStyle(item.id, { fontWeight: o.weight, fontStyle: o.style });
                        commitPending();
                        setWeightOpen(false);
                      }}
                    >
                      {o.label}
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </Row>
      <NumberField
        label={t('textPanel.fontSize')}
        icon={TypeIcon}
        value={item.fontSize}
        min={1}
        max={500}
        onChange={(v, c) => patch({ fontSize: v }, c)}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t('textPanel.lineHeight')}
          icon={MoveVerticalIcon}
          value={item.lineHeight}
          min={0.5}
          max={5}
          step={0.1}
          onChange={(v, c) => patch({ lineHeight: v }, c)}
        />
        <NumberField
          label={t('textPanel.letterSpacing')}
          icon={MoveHorizontalIcon}
          value={item.letterSpacing}
          min={-10}
          max={50}
          onChange={(v, c) => patch({ letterSpacing: v }, c)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('textPanel.text')}</span>
        <Textarea
          key={item.id}
          className="min-h-16 resize-y text-xs md:text-xs"
          defaultValue={item.text}
          onBlur={(e) => {
            const text = e.target.value;
            if (text !== item.text) patch({ text, direction: detectDirection(text) });
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {/* e2e 依赖 label:has-text("对齐") 下 button 顺序：left 在首位 */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t('textPanel.align')}</span>
          <div className="flex">
            {(['left', 'center', 'right'] as const).map((a, i) => {
              const Icon = ALIGN_ICONS[a];
              return (
                <Button
                  key={a}
                  variant="outline"
                  size="icon-sm"
                  className={`${groupCls(i, 3)} ${activeCls(item.textAlign === a)}`}
                  onClick={() => patch({ textAlign: a })}
                >
                  <Icon />
                </Button>
              );
            })}
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t('textPanel.direction')}</span>
          <div className="flex">
            {(['ltr', 'rtl'] as const).map((d, i) => {
              const Icon = DIR_ICONS[d];
              return (
                <Button
                  key={d}
                  variant="outline"
                  size="icon-sm"
                  title={d.toUpperCase()}
                  className={`${groupCls(i, 2)} ${activeCls(item.direction === d)}`}
                  onClick={() => patch({ direction: d })}
                >
                  <Icon />
                </Button>
              );
            })}
          </div>
        </label>
      </div>
    </Section>
  );
};

/** 描边（官方 Stroke，默认折叠）：宽度 + 颜色始终可见 */
export const StrokeSection: React.FC<{ item: TextItem }> = ({ item }) => {
  const patch = usePatch(item.id);
  const t = useT();
  return (
    <Section title={t('textPanel.stroke')} collapsible defaultOpen={false}>
      <NumberField
        label={t('textPanel.width')}
        icon={PenLineIcon}
        value={item.strokeWidth}
        min={0}
        max={100}
        onChange={(v, c) => patch({ strokeWidth: v }, c)}
      />
      <ColorField label={t('textPanel.color')} value={item.strokeColor} onChange={(v) => patch({ strokeColor: v })} />
    </Section>
  );
};

/** 背景（官方 Background）。启用 checkbox 是 e2e 钩子（verify-m4），保留；
 * 启用时写入官方默认值：#808080 / 圆角 20 / 内边距 40 */
export const BackgroundSection: React.FC<{ item: TextItem }> = ({ item }) => {
  const patch = usePatch(item.id);
  const t = useT();
  return (
    <Section title={t('textPanel.background')} collapsible defaultOpen>
      <Row label={t('textPanel.enable')}>
        <Checkbox
          checked={item.backgroundColor !== null}
          onCheckedChange={(checked) =>
            patch(
              checked
                ? { backgroundColor: '#808080', backgroundBorderRadius: 20, backgroundPadding: 40 }
                : { backgroundColor: null },
            )
          }
        />
      </Row>
      {item.backgroundColor !== null ? (
        <>
          <ColorField
            label={t('textPanel.color')}
            value={item.backgroundColor}
            onChange={(v) => patch({ backgroundColor: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t('textPanel.borderRadius')}
              icon={SquareRoundCornerIcon}
              value={item.backgroundBorderRadius}
              min={0}
              onChange={(v, c) => patch({ backgroundBorderRadius: v }, c)}
            />
            <NumberField
              label={t('textPanel.padding')}
              icon={MoveHorizontalIcon}
              value={item.backgroundPadding}
              min={0}
              max={100}
              onChange={(v, c) => patch({ backgroundPadding: v }, c)}
            />
          </div>
        </>
      ) : null}
    </Section>
  );
};
