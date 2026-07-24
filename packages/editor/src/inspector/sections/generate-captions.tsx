import type React from 'react';
import { CaptionsIcon } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { useEditor, useEditorApi, useEditorDeps } from '../../state/context';
import { generateCaptions } from '../../lib/captioning';
import { useT } from '../../lib/i18n';
import { Section } from '../fields';

/** 生成字幕入口：audio 或含音轨的 video（官方 Captions 区，默认折叠） */
export const GenerateCaptionsSection: React.FC<{ itemId: string }> = ({ itemId }) => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const task = useEditor((s) => s.captioningTasks.findLast((t) => t.itemId === itemId));
  const busy = task?.status === 'extracting' || task?.status === 'transcribing';
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
      {task?.status === 'error' ? (
        <div className="break-all text-xs text-destructive">{task.error?.slice(0, 200)}</div>
      ) : null}
    </Section>
  );
};
