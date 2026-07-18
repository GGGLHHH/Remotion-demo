import type React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { MainComposition, calcDuration } from '@editor/shared/composition';
import { useEditorStore } from '../state/store';
import { importFiles } from '../lib/import-assets';
import { playerRef } from './player-ref';
import { SelectionOverlay } from './SelectionOverlay';
import { CropOverlay } from './CropOverlay';
import { TextEditOverlay } from './TextEditOverlay';
import { DrawSolidOverlay } from './DrawSolidOverlay';

export const CanvasView: React.FC<{
  /** 绘制色块模式（状态由 App 持有） */
  drawSolidMode: boolean;
  onExitDrawSolid: () => void;
}> = ({ drawSolidMode, onExitDrawSolid }) => {
  const undoable = useEditorStore((s) => s.undoable);
  const canvasZoom = useEditorStore((s) => s.canvasZoom);
  const setCanvasZoom = useEditorStore((s) => s.setCanvasZoom);
  const localUrls = useEditorStore((s) => s.localUrls);
  const fontHoverPreview = useEditorStore((s) => s.fontHoverPreview);
  const cropMode = useEditorStore((s) => s.itemSelectedForCrop !== null);
  const loop = useEditorStore((s) => s.loop);

  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.1);
  const [frame, setFrame] = useState(0);

  const durationInFrames = useMemo(() => calcDuration(undoable.items), [undoable.items]);

  // 适配缩放：跟随容器尺寸
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const PADDING = 48;
      const w = el.clientWidth - PADDING;
      const h = el.clientHeight - PADDING;
      setFitScale(Math.max(0.02, Math.min(w / undoable.compositionWidth, h / undoable.compositionHeight)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [undoable.compositionWidth, undoable.compositionHeight]);

  // 当前帧（命中判定 + 选择框可见性用）
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener('frameupdate', onFrame);
    return () => p.removeEventListener('frameupdate', onFrame);
  }, []);

  // Cmd/Ctrl + 滚轮缩放
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      const store = useEditorStore.getState();
      const cur = store.canvasZoom === 'fit' ? fitScale : store.canvasZoom;
      store.setCanvasZoom(cur * Math.exp(-e.deltaY * 0.002));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fitScale]);

  const scale = canvasZoom === 'fit' ? fitScale : canvasZoom;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950">
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (!files.length) return;
          const stage = e.currentTarget.querySelector('[data-stage]')?.getBoundingClientRect();
          const dropAt = stage
            ? { x: (e.clientX - stage.left) / scale, y: (e.clientY - stage.top) / scale }
            : undefined;
          void importFiles(files, dropAt);
        }}
      >
        <div
          data-stage
          className="relative shrink-0 shadow-2xl"
          style={{
            width: undoable.compositionWidth * scale,
            height: undoable.compositionHeight * scale,
          }}
        >
          <Player
            ref={playerRef}
            component={MainComposition}
            inputProps={{
              state: undoable,
              assetUrlOverrides: localUrls,
              textFontOverride: fontHoverPreview,
            }}
            durationInFrames={durationInFrames}
            compositionWidth={undoable.compositionWidth}
            compositionHeight={undoable.compositionHeight}
            fps={undoable.fps}
            loop={loop}
            style={{ width: '100%', height: '100%' }}
          />
          {cropMode ? null : <SelectionOverlay scale={scale} frame={frame} />}
          <CropOverlay scale={scale} />
          <TextEditOverlay scale={scale} />
          {drawSolidMode ? <DrawSolidOverlay scale={scale} onDone={onExitDrawSolid} /> : null}
        </div>
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-zinc-900/90 px-2 py-1 text-xs text-zinc-300">
        <button
          className="px-1.5 py-0.5 hover:text-white"
          onClick={() => setCanvasZoom(scale / 1.25)}
          title="缩小 (-)"
        >
          −
        </button>
        <button
          className="min-w-12 tabular-nums hover:text-white"
          onClick={() => setCanvasZoom('fit')}
          title="适配 (0)"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          className="px-1.5 py-0.5 hover:text-white"
          onClick={() => setCanvasZoom(scale * 1.25)}
          title="放大 (+)"
        >
          +
        </button>
      </div>
    </div>
  );
};
