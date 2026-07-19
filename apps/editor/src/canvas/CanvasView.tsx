import type React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { MainComposition, calcDuration } from '@gedatou/shared/composition';
import { useEditor, useEditorApi } from '../state/context';
import { importFiles } from '../lib/import-assets';
import { playerRef } from './player-ref';
import { fitScaleRef, panRef, setPan, stageElRef } from './fit-scale';
import { SelectionOverlay } from './SelectionOverlay';
import { CompositionResizeHandles } from './CompositionResizeHandles';
import { CropOverlay } from './CropOverlay';
import { TextEditOverlay } from './TextEditOverlay';
import { DrawSolidOverlay } from './DrawSolidOverlay';
import { TextToolOverlay } from './TextToolOverlay';

/** 画布工具模式（状态由 App 持有）：绘制色块 / 点击放置文本 */
export type CanvasTool = 'solid' | 'text' | null;

/** 与 store.setCanvasZoom 相同的钳制，光标锚定的平移计算必须用钳制后的值才不漂 */
const clampZoom = (z: number) => Math.min(4, Math.max(0.1, z));

export const CanvasView: React.FC<{
  tool: CanvasTool;
  onExitTool: () => void;
}> = ({ tool, onExitTool }) => {
  const editorApi = useEditorApi();
  const undoable = useEditor((s) => s.undoable);
  const canvasZoom = useEditor((s) => s.canvasZoom);
  const localUrls = useEditor((s) => s.localUrls);
  const fontHoverPreview = useEditor((s) => s.fontHoverPreview);
  const cropMode = useEditor((s) => s.itemSelectedForCrop !== null);
  const loop = useEditor((s) => s.loop);

  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.1);

  const durationInFrames = useMemo(() => calcDuration(undoable.items), [undoable.items]);

  // inputProps 引用稳定（仅真实编辑时变化）：播放中 Player 子树不因包装对象换新而重渲
  const inputProps = useMemo(
    () => ({ state: undoable, assetUrlOverrides: localUrls, textFontOverride: fontHoverPreview }),
    [undoable, localUrls, fontHoverPreview],
  );

  const scale = canvasZoom === 'fit' ? fitScale : canvasZoom;

  // 适配缩放：始终跟随容器尺寸重算（手动缩放下也更新 fitScaleRef，作"适应"对比与相对缩放基准）；
  // "适应"模式下同时把舞台平移到居中——居中只是 pan 的派生值
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const PADDING = 48;
      const w = el.clientWidth - PADDING;
      const h = el.clientHeight - PADDING;
      const s = Math.max(0.02, Math.min(w / undoable.compositionWidth, h / undoable.compositionHeight));
      fitScaleRef.current = s;
      setFitScale(s);
      if (editorApi.getState().canvasZoom === 'fit') {
        setPan(
          (el.clientWidth - undoable.compositionWidth * s) / 2,
          (el.clientHeight - undoable.compositionHeight * s) / 2,
        );
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [undoable.compositionWidth, undoable.compositionHeight]);

  // 缩放变化 → 平移锚定：进入"适应"= 重新居中；数字缩放（工具栏 ± / 快捷键）= 视口中心锚定，
  // 避免舞台跳走。滚轮/捏合缩放已自带光标锚定，置位 zoomPanHandledRef 跳过本效果
  const prevScaleRef = useRef(scale);
  const zoomPanHandledRef = useRef(false);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (canvasZoom === 'fit') {
      setPan(
        (el.clientWidth - undoable.compositionWidth * scale) / 2,
        (el.clientHeight - undoable.compositionHeight * scale) / 2,
      );
    } else if (!zoomPanHandledRef.current && prevScaleRef.current !== scale) {
      const k = scale / prevScaleRef.current;
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      setPan(cx - (cx - panRef.current.x) * k, cy - (cy - panRef.current.y) * k);
    }
    zoomPanHandledRef.current = false;
    prevScaleRef.current = scale;
  }, [scale, canvasZoom, undoable.compositionWidth, undoable.compositionHeight]);

  // 滚轮：平移视口（触控板双指自然平移）；Cmd/Ctrl+滚轮（含触控板捏合）：以光标为锚缩放
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const store = editorApi.getState();
      const cur = store.canvasZoom === 'fit' ? fitScaleRef.current : store.canvasZoom;
      if (e.metaKey || e.ctrlKey) {
        const next = clampZoom(cur * Math.exp(-e.deltaY * 0.002));
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const k = next / cur;
        // 光标下的合成点保持不动：pan' = 光标 − (光标 − pan)×k
        setPan(mx - (mx - panRef.current.x) * k, my - (my - panRef.current.y) * k);
        zoomPanHandledRef.current = true;
        store.setCanvasZoom(next);
      } else {
        // 手动平移退出"适应"自动模式（转为等值数字缩放，pan 交还给用户）
        if (store.canvasZoom === 'fit') store.setCanvasZoom(cur);
        setPan(panRef.current.x - e.deltaX, panRef.current.y - e.deltaY);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 中键拖拽平移（Figma 手感）；起点可在舞台/元素上（事件冒泡到容器，左键行为不受影响）
  const onPanPointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); // 抑制中键自动滚动
    const store = editorApi.getState();
    if (store.canvasZoom === 'fit') store.setCanvasZoom(fitScaleRef.current); // 手动平移退出"适应"
    const el = containerRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
    const sx = e.clientX;
    const sy = e.clientY;
    const p0 = { ...panRef.current };
    const onMove = (ev: PointerEvent) => setPan(p0.x + ev.clientX - sx, p0.y + ev.clientY - sy);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // 合成外空白区域：单击取消选择，拖拽 = 框选（触碰即预选中，与合成内框选一致）
  const [voidMarquee, setVoidMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const onVoidPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const container = e.currentTarget as HTMLElement;
    const stage = container.querySelector('[data-stage]');
    if (!stage) return;
    editorApi.getState().setSelected([]);
    const start = { x: e.clientX, y: e.clientY };
    const onMove = (ev: PointerEvent) => {
      const cRect = container.getBoundingClientRect();
      const x1 = Math.min(start.x, ev.clientX);
      const x2 = Math.max(start.x, ev.clientX);
      const y1 = Math.min(start.y, ev.clientY);
      const y2 = Math.max(start.y, ev.clientY);
      setVoidMarquee({
        x: x1 - cRect.left,
        y: y1 - cRect.top,
        w: x2 - x1,
        h: y2 - y1,
      });
      const sRect = stage.getBoundingClientRect();
      const cx1 = (x1 - sRect.left) / scale;
      const cx2 = (x2 - sRect.left) / scale;
      const cy1 = (y1 - sRect.top) / scale;
      const cy2 = (y2 - sRect.top) / scale;
      const st = editorApi.getState();
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
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
        onPointerDown={(e) => {
          if (e.button === 1) onPanPointerDown(e);
          else onVoidPointerDown(e);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (!files.length) return;
          const stage = e.currentTarget.querySelector('[data-stage]')?.getBoundingClientRect();
          const dropAt = stage
            ? { x: (e.clientX - stage.left) / scale, y: (e.clientY - stage.top) / scale }
            : undefined;
          void importFiles(editorApi, files, dropAt);
        }}
      >
        <div
          data-stage
          ref={(el) => {
            stageElRef.current = el;
          }}
          className="absolute shadow-2xl"
          style={{
            left: panRef.current.x,
            top: panRef.current.y,
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
