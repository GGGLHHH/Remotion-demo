import type React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { MainComposition, calcDuration } from '@editor/shared/composition';
import { useEditorStore } from '../state/store';
import { importFiles } from '../lib/import-assets';
import { playerRef } from './player-ref';
import { canvasRefitRef, fitScaleRef, suppressRefitRef } from './fit-scale';
import { SelectionOverlay } from './SelectionOverlay';
import { CompositionResizeHandles } from './CompositionResizeHandles';
import { CropOverlay } from './CropOverlay';
import { TextEditOverlay } from './TextEditOverlay';
import { DrawSolidOverlay } from './DrawSolidOverlay';
import { TextToolOverlay } from './TextToolOverlay';

/** 画布工具模式（状态由 App 持有）：绘制色块 / 点击放置文本 */
export type CanvasTool = 'solid' | 'text' | null;

export const CanvasView: React.FC<{
  tool: CanvasTool;
  onExitTool: () => void;
}> = ({ tool, onExitTool }) => {
  const undoable = useEditorStore((s) => s.undoable);
  const canvasZoom = useEditorStore((s) => s.canvasZoom);
  const localUrls = useEditorStore((s) => s.localUrls);
  const fontHoverPreview = useEditorStore((s) => s.fontHoverPreview);
  const cropMode = useEditorStore((s) => s.itemSelectedForCrop !== null);
  const loop = useEditorStore((s) => s.loop);

  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.1);

  const durationInFrames = useMemo(() => calcDuration(undoable.items), [undoable.items]);

  // inputProps 引用稳定（仅真实编辑时变化）：播放中 Player 子树不因包装对象换新而重渲
  const inputProps = useMemo(
    () => ({ state: undoable, assetUrlOverrides: localUrls, textFontOverride: fontHoverPreview }),
    [undoable, localUrls, fontHoverPreview],
  );

  // 适配缩放：跟随容器尺寸
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      // 画布手柄拖拽中冻结重算：比例中途变化会让内容在屏幕上漂移
      if (suppressRefitRef.current) return;
      const PADDING = 48;
      const w = el.clientWidth - PADDING;
      const h = el.clientHeight - PADDING;
      const s = Math.max(0.02, Math.min(w / undoable.compositionWidth, h / undoable.compositionHeight));
      fitScaleRef.current = s; // 快捷键/工具栏相对缩放的基准
      setFitScale(s);
    };
    canvasRefitRef.current = update;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [undoable.compositionWidth, undoable.compositionHeight]);

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

  // 合成外空白区域：单击取消选择，拖拽 = 框选（触碰即预选中，与合成内框选一致）
  const [voidMarquee, setVoidMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const onVoidPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const container = e.currentTarget as HTMLElement;
    const stage = container.querySelector('[data-stage]');
    if (!stage) return;
    useEditorStore.getState().setSelected([]);
    const start = { x: e.clientX, y: e.clientY };
    const onMove = (ev: PointerEvent) => {
      const cRect = container.getBoundingClientRect();
      const x1 = Math.min(start.x, ev.clientX);
      const x2 = Math.max(start.x, ev.clientX);
      const y1 = Math.min(start.y, ev.clientY);
      const y2 = Math.max(start.y, ev.clientY);
      setVoidMarquee({
        x: x1 - cRect.left + container.scrollLeft,
        y: y1 - cRect.top + container.scrollTop,
        w: x2 - x1,
        h: y2 - y1,
      });
      const sRect = stage.getBoundingClientRect();
      const cx1 = (x1 - sRect.left) / scale;
      const cx2 = (x2 - sRect.left) / scale;
      const cy1 = (y1 - sRect.top) / scale;
      const cy2 = (y2 - sRect.top) / scale;
      const st = useEditorStore.getState();
      const f = playerRef.current?.getCurrentFrame() ?? 0;
      const hits: string[] = [];
      for (const item of Object.values(st.undoable.items)) {
        if (item.type === 'audio') continue;
        if (f < item.from || f >= item.from + item.durationInFrames) continue;
        if (item.left < cx2 && cx1 < item.left + item.width && item.top < cy2 && cy1 < item.top + item.height) {
          hits.push(item.id);
        }
      }
      st.setSelected(hits);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setVoidMarquee(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950">
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto"
        onPointerDown={onVoidPointerDown}
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
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            compositionWidth={undoable.compositionWidth}
            compositionHeight={undoable.compositionHeight}
            fps={undoable.fps}
            loop={loop}
            style={{ width: '100%', height: '100%' }}
          />
          {cropMode ? null : <SelectionOverlay scale={scale} />}
          {cropMode || tool !== null ? null : <CompositionResizeHandles scale={scale} />}
          <CropOverlay scale={scale} />
          <TextEditOverlay scale={scale} />
          {tool === 'solid' ? <DrawSolidOverlay scale={scale} onDone={onExitTool} /> : null}
          {tool === 'text' ? <TextToolOverlay scale={scale} onDone={onExitTool} /> : null}
        </div>
        {voidMarquee ? (
          <div
            className="pointer-events-none absolute z-40 border border-[#0B84F3] bg-[#0B84F3]/10"
            style={{
              left: voidMarquee.x,
              top: voidMarquee.y,
              width: voidMarquee.w,
              height: voidMarquee.h,
            }}
          />
        ) : null}
      </div>
    </div>
  );
};
