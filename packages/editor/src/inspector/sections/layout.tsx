import type React from 'react';
import { useState } from 'react';
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignEndHorizontalIcon,
  AlignEndVerticalIcon,
  AlignStartHorizontalIcon,
  AlignStartVerticalIcon,
  LinkIcon,
  RotateCwIcon,
  RotateCwSquareIcon,
  type LucideIcon,
} from 'lucide-react';
import type { AnimatableProp, EditorStarterItem } from '@gedatou/shared';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { useEditorApi, useEditorRefs } from '../../state/context';
import { useT } from '../../lib/i18n';
import { NumberField } from '../NumberField';
import { Section } from '../fields';
import { KeyframeToggle } from '../KeyframeToggle';
import { useItemKeyframes } from '../use-item-keyframes';
import { AnimatableNumberField, useAnimatedValue } from '../AnimatableField';
import type { PatchFn } from '../patch';

// ---- 布局（官方 Layout 区：对齐 / 位置 / 尺寸 / 旋转） ----

const ALIGNS: {
  key: string;
  label: string;
  icon: LucideIcon;
  apply: (compW: number, compH: number, it: EditorStarterItem) => Partial<EditorStarterItem>;
}[] = [
  { key: 'l', label: 'inspector.alignLeft', icon: AlignStartVerticalIcon, apply: () => ({ left: 0 }) },
  { key: 'ch', label: 'inspector.alignCenterH', icon: AlignCenterVerticalIcon, apply: (w, _h, it) => ({ left: Math.round((w - it.width) / 2) }) },
  { key: 'r', label: 'inspector.alignRight', icon: AlignEndVerticalIcon, apply: (w, _h, it) => ({ left: w - it.width }) },
  { key: 't', label: 'inspector.alignTop', icon: AlignStartHorizontalIcon, apply: () => ({ top: 0 }) },
  { key: 'cv', label: 'inspector.alignCenterV', icon: AlignCenterHorizontalIcon, apply: (_w, h, it) => ({ top: Math.round((h - it.height) / 2) }) },
  { key: 'b', label: 'inspector.alignBottom', icon: AlignEndHorizontalIcon, apply: (_w, h, it) => ({ top: h - it.height }) },
];

/** 拼接式按钮组（官方 joined segmented group） */
const groupCls = (i: number, len: number) =>
  `flex-1 rounded-none ${i === 0 ? 'rounded-l-lg' : '-ml-px'} ${i === len - 1 ? 'rounded-r-lg' : ''}`;

export const LayoutSection: React.FC<{
  item: EditorStarterItem;
  patch: PatchFn;
  showLock: boolean;
  lockDefault: boolean;
}> = ({ item, patch, showLock, lockDefault }) => {
  const t = useT();
  const editorApi = useEditorApi();
  const kf = useItemKeyframes(item.id);
  const refs = useEditorRefs();
  // ItemPanel 以 item.id 为 key 重挂，锁比例默认值随类型生效（图片/视频默认开）
  const [locked, setLocked] = useState(lockDefault);
  // W/H 的 onChange 走 setW/setH（联动锁），不套 AnimatableNumberField 壳，只在此换 value 的读数来源
  const wValue = useAnimatedValue(item, 'width', kf);
  const hValue = useAnimatedValue(item, 'height', kf);
  // rotate-90 按钮需以此解析值（而非静态 item.rotation）为基数，与字段显示保持一致
  const rotationValue = useAnimatedValue(item, 'rotation', kf);
  /** 有关键帧的属性写关键帧（在播放头处 upsert），否则走原静态 patch —— 无关键帧条目行为不变。
   *  播放头帧号在提交时刻读取（imperative），不订阅，播放中不拖累整个面板重渲。 */
  const animPatch = (prop: AnimatableProp, v: number, commit?: boolean) => {
    if (kf.has(prop)) {
      const f = Math.max(0, Math.min(item.durationInFrames, refs.getPlayerFrame() - item.from));
      kf.setValue(prop, f, v, commit);
    } else {
      patch({ [prop]: v } as Partial<EditorStarterItem>, commit);
    }
  };

  const alignGroup = (defs: typeof ALIGNS) => (
    <div className="flex flex-1">
      {defs.map((a, i) => (
        <Tooltip key={a.key}>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                className={groupCls(i, defs.length)}
                onClick={() => {
                  const s = editorApi.getState().undoable;
                  const cur = s.items[item.id];
                  if (!cur) return;
                  const [key, value] = Object.entries(
                    a.apply(s.compositionWidth, s.compositionHeight, cur),
                  )[0] as [AnimatableProp, number];
                  animPatch(key, value, true);
                }}
              >
                <a.icon />
              </Button>
            }
          />
          <TooltipContent>{t(a.label)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );

  // ponytail: 锁比例按当前宽高比逐帧换算，长距离拖拽有轻微取整漂移；需要精确时在 scrub 起点缓存比例
  // 无关键帧时两维一次 patch 合并提交（单条撤销，行为与改造前完全一致）；
  // 但凡 width/height 任一打了关键帧，两维分开走 animPatch（关键帧按属性各自存列表，没有合并写入口）。
  const setLinkedDim = (prop: 'width' | 'height', v: number, c: boolean) => {
    const other = prop === 'width' ? 'height' : 'width';
    const linked = locked ? Math.max(1, Math.round((v * item[other]) / item[prop])) : null;
    if (!kf.has(prop) && (linked === null || !kf.has(other))) {
      patch((linked === null ? { [prop]: v } : { [prop]: v, [other]: linked }) as Partial<EditorStarterItem>, c);
      return;
    }
    animPatch(prop, v, c);
    if (linked !== null) animPatch(other, linked, c);
  };
  const setW = (v: number, c: boolean) => setLinkedDim('width', v, c);
  const setH = (v: number, c: boolean) => setLinkedDim('height', v, c);

  return (
    <Section title={t('inspector.layout')} collapsible defaultOpen>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('inspector.align')}</span>
        <div className="flex gap-2">
          {alignGroup(ALIGNS.slice(0, 3))}
          {alignGroup(ALIGNS.slice(3))}
        </div>
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('inspector.position')}</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1">
            <AnimatableNumberField item={item} prop="left" kf={kf} inline label="X" className="flex-1" onChange={(v, c) => animPatch('left', v, c)} />
          </div>
          <div className="flex items-center gap-1">
            <AnimatableNumberField item={item} prop="top" kf={kf} inline label="Y" className="flex-1" onChange={(v, c) => animPatch('top', v, c)} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('inspector.size')}</span>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1">
            <NumberField inline label="W" className="flex-1" value={wValue} min={1} onChange={setW} />
            <KeyframeToggle item={item} prop="width" kf={kf} />
          </div>
          <div className="flex flex-1 items-center gap-1">
            <NumberField inline label="H" className="flex-1" value={hValue} min={1} onChange={setH} />
            <KeyframeToggle item={item} prop="height" kf={kf} />
          </div>
          {showLock ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-pressed={locked}
                    className={locked ? 'border-primary text-primary' : ''}
                    onClick={() => setLocked((l) => !l)}
                  >
                    <LinkIcon />
                  </Button>
                }
              />
              <TooltipContent>{t('inspector.lockAspect')}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-1 items-end gap-1">
          <NumberField
            label={t('inspector.rotation')}
            icon={RotateCwIcon}
            className="flex-1"
            value={rotationValue}
            onChange={(v, c) => animPatch('rotation', v, c)}
          />
          <KeyframeToggle item={item} prop="rotation" kf={kf} />
        </div>
        <div className="flex flex-col">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => animPatch('rotation', (rotationValue + 90) % 360, true)}
                >
                  <RotateCwSquareIcon />
                </Button>
              }
            />
            <TooltipContent>{t('inspector.rotate90')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Section>
  );
};
