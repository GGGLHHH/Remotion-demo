import type React from 'react'
import { CaptionsIcon, Upload } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '#components/ui/button'
import { Spinner } from '#components/ui/spinner'
import { generateCaptions, importCaptionsForItem } from '#lib/captioning'
import { useT } from '#lib/i18n'
import { useEditor, useEditorApi, useEditorDeps } from '#state/context'
import { Section } from '../fields'

/**
 * 字幕入口（官方 Captions 区，默认折叠）：转录生成 / 导入现成的 .srt·.vtt。
 * 两条路并列摆这儿 —— 选中素材时这是找字幕最自然的位置，没音轨或转录不可用时也不至于没路可走。
 */
export const GenerateCaptionsSection: React.FC<{ itemId: string }> = ({ itemId }) => {
  const t = useT()
  const editorApi = useEditorApi()
  const deps = useEditorDeps()
  const fileRef = useRef<HTMLInputElement>(null)
  const task = useEditor(s => s.captioningTasks.findLast(t => t.itemId === itemId))
  const busy = task?.status === 'extracting' || task?.status === 'transcribing'
  return (
    <Section title={t('inspector.captions')} collapsible defaultOpen={false}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void generateCaptions(editorApi, deps, itemId)}
      >
        {busy ? <Spinner /> : <CaptionsIcon />}
        {busy
          ? task.status === 'extracting'
            ? t('inspector.extractingAudio')
            : t('inspector.transcribing')
          : t('inspector.generateCaptions')}
      </Button>
      {/* 同 toolbar 的 FileButton：不用 <label> 包 hidden input，Safari 不转发点击 */}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        title={t('inspector.importCaptionsTitle')}
        onClick={() => fileRef.current?.click()}
      >
        <Upload />
        {t('inspector.importCaptions')}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file)
            void importCaptionsForItem(editorApi, deps, itemId, file)
        }}
      />
      {task?.status === 'error'
        ? (
            <div className="text-xs break-all text-destructive">{task.error?.slice(0, 200)}</div>
          )
        : null}
    </Section>
  )
}
