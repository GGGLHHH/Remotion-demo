import type { EditorStarterItem } from '@gedatou/shared'
import type React from 'react'
import type { PatchFn } from '../patch'
import { useT } from '../../lib/i18n'
import { useEditor } from '../../state/context'
import { FadeSliders, Section } from '../fields'

// ---- 淡入淡出（官方 Fade 区）：非媒体类型的独立分区（媒体类型收在「视频/音频」区内） ----

export const FadeSection: React.FC<{ item: EditorStarterItem, patch: PatchFn, defaultOpen?: boolean }> = ({
  item,
  patch,
  defaultOpen = false,
}) => {
  const t = useT()
  const fps = useEditor(s => s.undoable.fps)
  return (
    <Section title={t('inspector.fade')} collapsible defaultOpen={defaultOpen}>
      <FadeSliders
        fadeInFrames={item.fadeInDurationInFrames}
        fadeOutFrames={item.fadeOutDurationInFrames}
        durationInFrames={item.durationInFrames}
        fps={fps}
        onPatch={p => patch(p, false)}
      />
    </Section>
  )
}
