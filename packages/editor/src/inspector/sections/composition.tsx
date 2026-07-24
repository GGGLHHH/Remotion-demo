import type React from 'react';
import { useState } from 'react';
import { ArrowLeftRightIcon, ClapperboardIcon } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { useEditor, useEditorApi, useEditorDeps } from '../../state/context';
import { startRender } from '../../lib/render-client';
import { useT } from '../../lib/i18n';
import { NumberField } from '../NumberField';
import { Section } from '../fields';

// ---- 空状态面板：画布 / 时长 / 导出 ----

const CODEC_LABELS: Record<'mp4' | 'webm', string> = {
  mp4: 'MP4 (H.264)',
  webm: 'WebM (VP8)',
};

export const ExportSection: React.FC<{ exportExtra?: React.ReactNode }> = ({ exportExtra }) => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const renderingTasks = useEditor((s) => s.renderingTasks);
  const hasItems = useEditor((s) => Object.keys(s.undoable.items).length > 0);
  const [codec, setCodec] = useState<'mp4' | 'webm'>('mp4');

  return (
    <Section title={t('inspector.export')}>
      <Select items={CODEC_LABELS} value={codec} onValueChange={(v) => setCodec(v as 'mp4' | 'webm')}>
        <SelectTrigger size="sm" className="w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mp4">{CODEC_LABELS.mp4}</SelectItem>
          <SelectItem value="webm">{CODEC_LABELS.webm}</SelectItem>
        </SelectContent>
      </Select>
      {/* 官方行为：时间线为空时禁用渲染按钮 */}
      <Button size="sm" variant="secondary" disabled={!hasItems} onClick={() => void startRender(editorApi, deps, codec)}>
        <ClapperboardIcon />
        {t('inspector.render')}
      </Button>
      {renderingTasks.map((task) => (
        <div key={task.id} className="rounded-lg border border-border p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            {/* 文件名由前端在发起渲染时就组装好（见 lib/render-client），故全程可显示，
                且就是实际下载到的名字。codec 已体现在扩展名里，不再另挂徽章。 */}
            <span className="min-w-0 flex-1 truncate font-medium" title={task.fileName ?? task.codec}>
              {task.fileName ?? task.codec}
            </span>
            {task.status === 'done' && task.url ? (
              /* 产物带 Content-Disposition: attachment（文件名由服务端定；跨源 URL 下
                 a[download] 的文件名会被浏览器忽略），故不加 target=_blank 免闪空白页 */
              <a
                href={task.url}
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {t('inspector.download')}
              </a>
            ) : (
              <span className="tabular-nums text-muted-foreground">
                {task.status === 'error' ? t('inspector.failed') : `${Math.round(task.progress * 100)}%`}
              </span>
            )}
          </div>
          {task.status === 'error' ? (
            <div className="mt-1 break-all text-destructive">{task.error?.slice(0, 200)}</div>
          ) : (
            <div className="mt-2 h-1 rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.round(task.progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      ))}
      {/* 宿主注入槽：渲染产物的持久历史（renderingTasks 是内存态、刷新即失，持久列表由宿主提供） */}
      {exportExtra}
    </Section>
  );
};

/** 合成总时长 mm:ss.cc（官方 Duration 区的只读读数） */
const formatTimecode = (frames: number, fps: number): string => {
  const totalCs = Math.round((frames / fps) * 100);
  const mm = String(Math.floor(totalCs / 6000)).padStart(2, '0');
  const ss = String(Math.floor((totalCs % 6000) / 100)).padStart(2, '0');
  const cs = String(totalCs % 100).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
};

export const CompositionPanel: React.FC<{ canvasExtra?: React.ReactNode; exportExtra?: React.ReactNode }> = ({
  canvasExtra,
  exportExtra,
}) => {
  const t = useT();
  const width = useEditor((s) => s.undoable.compositionWidth);
  const height = useEditor((s) => s.undoable.compositionHeight);
  const fps = useEditor((s) => s.undoable.fps);
  const totalFrames = useEditor((s) =>
    Object.values(s.undoable.items).reduce((m, i) => Math.max(m, i.from + i.durationInFrames), 0),
  );
  const updateUndoable = useEditor((s) => s.updateUndoable);

  return (
    <>
      <Section title={t('inspector.canvas')}>
        <div className="flex items-center gap-2">
          <NumberField
            inline
            label="W"
            className="flex-1"
            value={width}
            min={2}
            onChange={(v, c) =>
              updateUndoable((s) => ({ ...s, compositionWidth: Math.round(v / 2) * 2 }), { commit: c })
            }
          />
          <NumberField
            inline
            label="H"
            className="flex-1"
            value={height}
            min={2}
            onChange={(v, c) =>
              updateUndoable((s) => ({ ...s, compositionHeight: Math.round(v / 2) * 2 }), { commit: c })
            }
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('inspector.swapDimensions')}
                  onClick={() =>
                    updateUndoable((s) => ({
                      ...s,
                      compositionWidth: s.compositionHeight,
                      compositionHeight: s.compositionWidth,
                    }))
                  }
                >
                  <ArrowLeftRightIcon />
                </Button>
              }
            />
            <TooltipContent>{t('inspector.swapDimensions')}</TooltipContent>
          </Tooltip>
        </div>
        {canvasExtra}
      </Section>
      <Section title={t('inspector.duration')}>
        <div className="text-xs tabular-nums text-muted-foreground">
          {formatTimecode(totalFrames, fps)}
        </div>
      </Section>
      <ExportSection exportExtra={exportExtra} />
    </>
  );
};
