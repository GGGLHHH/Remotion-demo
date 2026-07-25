import type React from 'react';
import { useRef } from 'react';
import { Download, Plus, Upload, X } from 'lucide-react';
import type { Caption, CaptionsItem } from '@gedatou/shared';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useEditor, useEditorDeps } from '../../state/context';
import { useItemPatch } from '../patch';
import { NumberField } from '../NumberField';
import { ColorField, Row, Section } from '../fields';
import { FontPicker } from '../FontPicker';
import { parseSubtitles, serializeSubtitles } from '../../lib/subtitle-io';
import { useT } from '../../lib/i18n';

/** 字幕样式 + 逐词修正（官方 Captions 块专属分区） */
export const CaptionsStyleSection: React.FC<{ item: CaptionsItem }> = ({ item }) => {
  const t = useT();
  const deps = useEditorDeps();
  const updateUndoable = useEditor((s) => s.updateUndoable);
  const asset = useEditor((s) => s.undoable.assets[item.assetId]);
  const captions = asset?.type === 'caption' ? asset.captions : [];
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = useItemPatch<CaptionsItem>(item.id);

  /** 不可变改写 asset.captions（基准取 state 内当前值，不用闭包快照）。
   * resize=true 时把块尾伸到覆盖最后一条 —— 导入的字幕通常比默认 3 秒长得多。 */
  const editCaptions = (fn: (prev: Caption[]) => Caption[], resize = false) =>
    updateUndoable((s) => {
      const cur = s.assets[item.assetId];
      if (!cur || cur.type !== 'caption') return s;
      const next = fn(cur.captions);
      const assets = { ...s.assets, [item.assetId]: { ...cur, captions: next } };
      const it = s.items[item.id];
      if (!resize || !next.length || !it) return { ...s, assets };
      const durationInFrames = Math.max(
        1,
        Math.ceil((Math.max(...next.map((c) => c.endMs)) / 1000) * s.fps),
      );
      return { ...s, assets, items: { ...s.items, [item.id]: { ...it, durationInFrames } } };
    });

  /** 不可变更新 asset.captions 里第 i 条 token */
  const patchCaption = (index: number, partial: Partial<Caption>) =>
    editCaptions((prev) => prev.map((c, i) => (i === index ? { ...c, ...partial } : c)));

  /** 末尾追加一行：接着上一条的结束时间，默认 1 秒 */
  const addCaption = () =>
    editCaptions((prev) => {
      const startMs = prev.at(-1)?.endMs ?? 0;
      // 非首行带前导空格：断句协议，见 subtitle-io.ts
      const text = prev.length ? ' 字幕' : '字幕';
      return [...prev, { text, startMs, endMs: startMs + 1000, timestampMs: startMs, confidence: null }];
    });

  const importSubtitles = async (file: File) => {
    const parsed = parseSubtitles(await file.text());
    if (!parsed.length) {
      deps.notify(t('captionsPanel.importEmpty'), 'error');
      return;
    }
    editCaptions(() => parsed, true);
    deps.notify(t('captionsPanel.imported', { count: parsed.length }), 'success');
  };

  /** 导出为 .srt：同 downloadStateFile 的 Blob + <a download> 套路 */
  const exportSubtitles = () => {
    const blob = new Blob([serializeSubtitles(captions)], { type: 'application/x-subrip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // filename 可能来自 whisper(「源名.captions.json」)或导入的文件(「x.srt」)，两种后缀都剥掉，免得导出成 x.srt.srt
    a.download = `${asset?.filename?.replace(/\.(captions\.json|srt|vtt)$/i, '') || 'captions'}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Section title={t('captionsPanel.style')}>
        <Row label={t('captionsPanel.font')}>
          <FontPicker itemId={item.id} value={item.fontFamily} onCommit={(f) => patch({ fontFamily: f })} />
        </Row>
        <NumberField label={t('captionsPanel.fontSize')} value={item.fontSize} min={4} max={800} onChange={(v, c) => patch({ fontSize: v }, c)} />
        <ColorField label={t('captionsPanel.color')} value={item.color} onChange={(v) => patch({ color: v })} />
        <ColorField label={t('captionsPanel.highlightColor')} value={item.highlightColor} onChange={(v) => patch({ highlightColor: v })} />
        <NumberField
          label={t('captionsPanel.pageDurationMs')}
          value={item.pageDurationInMs}
          min={100}
          max={10000}
          step={100}
          onChange={(v, c) => patch({ pageDurationInMs: v }, c)}
        />
        <NumberField
          label={t('captionsPanel.maxLines')}
          value={item.maxLines}
          min={1}
          max={10}
          onChange={(v, c) => patch({ maxLines: Math.round(v) }, c)}
        />
      </Section>
      <Section title={t('captionsPanel.wordCorrection')}>
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-0.5">
          {captions.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              {/* e2e 依赖 data-caption-word 定位逐词输入框 */}
              <Input
                key={`t${i}:${c.text}`}
                data-caption-word={i}
                className="h-7 flex-1 px-2 text-xs md:text-xs"
                /* 前导空格是断句协议（见 subtitle-io.ts），不该露给用户改：显示时抹掉、写回时原样带上 */
                defaultValue={c.text.trimStart()}
                onBlur={(e) => {
                  const next = (c.text.startsWith(' ') ? ' ' : '') + e.target.value;
                  if (next !== c.text) patchCaption(i, { text: next });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              <Input
                key={`s${i}:${c.startMs}`}
                type="number"
                title={t('captionsPanel.startMs')}
                className="h-7 w-20 shrink-0 px-1.5 text-right text-xs tabular-nums md:text-xs"
                defaultValue={c.startMs}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v) && v !== c.startMs) {
                    patchCaption(i, { startMs: v, timestampMs: v });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 shrink-0"
                aria-label={t('captionsPanel.removeLine')}
                title={t('captionsPanel.removeLine')}
                onClick={() => editCaptions((prev) => prev.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={addCaption}>
            <Plus />
            {t('captionsPanel.addLine')}
          </Button>
          {/* 同 toolbar 的 FileButton：不用 <label> 包 hidden input，Safari 不转发点击 */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            title={t('captionsPanel.importTitle')}
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
            {t('captionsPanel.import')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!captions.length}
            title={t('captionsPanel.exportTitle')}
            onClick={exportSubtitles}
          >
            <Download />
            {t('captionsPanel.export')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".srt,.vtt,text/vtt,application/x-subrip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importSubtitles(file);
            }}
          />
        </div>
      </Section>
    </>
  );
};
