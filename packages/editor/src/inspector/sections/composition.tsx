import type React from 'react'
import { dictValues } from '@gedatou/shared'
import { AlertCircleIcon, ArrowLeftRightIcon, CheckIcon, ClapperboardIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Spinner } from '../../components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip'
import { useT } from '../../lib/i18n'
import { startRender } from '../../lib/render-client'
import { useEditor, useEditorApi, useEditorDeps } from '../../state/context'
import { Section } from '../fields'
import { NumberField } from '../NumberField'

// ---- 空状态面板：画布 / 时长 / 导出 ----

const CODEC_LABELS: Record<'mp4' | 'webm', string> = {
  mp4: 'MP4 (H.264)',
  webm: 'WebM (VP8)',
}

export const ExportSection: React.FC<{ exportExtra?: React.ReactNode }> = ({ exportExtra }) => {
  const t = useT()
  const editorApi = useEditorApi()
  const deps = useEditorDeps()
  const renderingTasks = useEditor(s => s.renderingTasks)
  const hasItems = useEditor(s => Object.keys(s.undoable.items).length > 0)
  const [codec, setCodec] = useState<'mp4' | 'webm'>('mp4')

  return (
    <Section title={t('inspector.export')}>
      <Select items={CODEC_LABELS} value={codec} onValueChange={v => setCodec(v as 'mp4' | 'webm')}>
        <SelectTrigger size="sm" className="text-xs inline-full">
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
      {renderingTasks.map((task) => {
        const pct = Math.round(task.progress * 100)
        return (
          // 布局刻意对齐「缩略图 + 标题 + 副行」的媒体卡:这块的正下方就是 exportExtra
          // （宿主注入的成片列表，通常正是媒体卡列表），渲染完成时这张卡等于被那张接位。
          // 两者行高/缩略图尺寸不一致的话，完成瞬间整列会跳一下。
          <div
            key={task.id}
            className="
              flex gap-3 rounded-lg border border-border bg-card p-2.5 text-xs
            "
          >
            {/* 缩略图槽:渲染中没有画面可放,给状态图标。size-14 是媒体卡缩略图的尺寸,别改小 */}
            <span className="
              flex shrink-0 items-center justify-center rounded-md bg-muted
              text-muted-foreground block-14 inline-14
            "
            >
              {task.status === 'error'
                ? (
                    <AlertCircleIcon className="
                      text-destructive block-5 inline-5
                    "
                    />
                  )
                : task.status === 'done'
                  ? (
                      <CheckIcon className="block-5 inline-5" />
                    )
                  : (
                      <Spinner className="block-5 inline-5" />
                    )}
            </span>
            <div className="flex flex-1 flex-col gap-1 min-inline-0">
              {/* 文件名由前端在发起渲染时就组装好（见 lib/render-client），故全程可显示，
                  且就是实际下载到的名字。codec 已体现在扩展名里，不再另挂徽章。 */}
              <span className="truncate text-sm font-semibold" title={task.fileName ?? task.codec}>
                {task.fileName ?? task.codec}
              </span>
              <span className="
                flex items-center justify-between gap-2 text-muted-foreground
              "
              >
                <span>
                  {task.status === 'error'
                    ? t('inspector.failed')
                    : task.status === 'done'
                      ? t('inspector.renderDone')
                      : task.status === 'queued'
                        ? t('inspector.queued')
                        : t('inspector.rendering')}
                </span>
                {task.status === 'done' && task.url != null && task.url !== ''
                  ? (
                /* 产物带 Content-Disposition: attachment（文件名由服务端定；跨源 URL 下
                     a[download] 的文件名会被浏览器忽略），故不加 target=_blank 免闪空白页 */
                      <a
                        href={task.url}
                        rel="noreferrer"
                        className="
                          text-primary underline-offset-4
                          hover:underline
                        "
                      >
                        {t('inspector.download')}
                      </a>
                    )
                  : task.status === 'error'
                    ? null
                    : (
                        <span className="tabular-nums">
                          {pct}
                          %
                        </span>
                      )}
              </span>
              {task.status === 'error'
                ? (
                    <span className="break-all text-destructive">{task.error?.slice(0, 200)}</span>
                  )
                : (
                    <span className="
                      overflow-hidden rounded-full bg-muted block-1 inline-full
                    "
                    >
                      {/* overflow-hidden + 显式时长/缓动:没有的话进度是瞬跳的,且满格时内条的圆角会溢出外框 */}
                      <span
                        className="
                          block rounded-full bg-primary transition-[width]
                          duration-300 ease-linear block-full
                        "
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  )}
            </div>
          </div>
        )
      })}
      {/* 宿主注入槽：渲染产物的持久历史（renderingTasks 是内存态、刷新即失，持久列表由宿主提供） */}
      {exportExtra}
    </Section>
  )
}

/** 合成总时长 mm:ss.cc（官方 Duration 区的只读读数） */
function formatTimecode(frames: number, fps: number): string {
  const totalCs = Math.round((frames / fps) * 100)
  const mm = String(Math.floor(totalCs / 6000)).padStart(2, '0')
  const ss = String(Math.floor((totalCs % 6000) / 100)).padStart(2, '0')
  const cs = String(totalCs % 100).padStart(2, '0')
  return `${mm}:${ss}.${cs}`
}

export const CompositionPanel: React.FC<{ canvasExtra?: React.ReactNode, exportExtra?: React.ReactNode }> = ({
  canvasExtra,
  exportExtra,
}) => {
  const t = useT()
  const width = useEditor(s => s.undoable.compositionWidth)
  const height = useEditor(s => s.undoable.compositionHeight)
  const fps = useEditor(s => s.undoable.fps)
  const totalFrames = useEditor(s =>
    dictValues(s.undoable.items).reduce((m, i) => Math.max(m, i.from + i.durationInFrames), 0),
  )
  const updateUndoable = useEditor(s => s.updateUndoable)

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
              updateUndoable(s => ({ ...s, compositionWidth: Math.round(v / 2) * 2 }), { commit: c })}
          />
          <NumberField
            inline
            label="H"
            className="flex-1"
            value={height}
            min={2}
            onChange={(v, c) =>
              updateUndoable(s => ({ ...s, compositionHeight: Math.round(v / 2) * 2 }), { commit: c })}
          />
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('inspector.swapDimensions')}
                  onClick={() =>
                    updateUndoable(s => ({
                      ...s,
                      compositionWidth: s.compositionHeight,
                      compositionHeight: s.compositionWidth,
                    }))}
                >
                  <ArrowLeftRightIcon />
                </Button>
              )}
            />
            <TooltipContent>{t('inspector.swapDimensions')}</TooltipContent>
          </Tooltip>
        </div>
        {canvasExtra}
      </Section>
      <Section title={t('inspector.duration')}>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatTimecode(totalFrames, fps)}
        </div>
      </Section>
      <ExportSection exportExtra={exportExtra} />
    </>
  )
}
