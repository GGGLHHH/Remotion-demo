import type React from 'react';
import { useRef, useState } from 'react';
import type { EditorStarterItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { Filmstrip } from './Filmstrip';
import { Waveform } from './Waveform';

const COLORS: Record<EditorStarterItem['type'], string> = {
  solid: 'bg-blue-600/80',
  text: 'bg-purple-600/80',
  video: 'bg-teal-600/80',
  audio: 'bg-emerald-600/80',
  image: 'bg-amber-600/80',
  gif: 'bg-pink-600/80',
  captions: 'bg-rose-600/80',
};

export const itemLabel = (item: EditorStarterItem): string => {
  if (item.type === 'text') return item.text.slice(0, 20) || 'Text';
  if (item.type === 'solid') return 'Solid';
  return item.type;
};

/** 与检查器一致的 dB 显示 */
const toDb = (v: number) => (v <= 0 ? '-∞' : `${(20 * Math.log10(v)).toFixed(1)}dB`);

export const ItemBlock: React.FC<{
  item: EditorStarterItem;
  zoom: number;
  /** move 拖拽中隐藏原块（不卸载，保持指针捕获与布局） */
  hidden?: boolean;
  onPointerDown?: (e: React.PointerEvent, item: EditorStarterItem, mode: 'move' | 'trim-start' | 'trim-end') => void;
}> = ({ item, zoom, hidden, onPointerDown }) => {
  const selected = useEditorStore((s) => s.selectedItemIds.includes(item.id));
  const mediaUrl = useEditorStore((s) => {
    if (item.type !== 'video' && item.type !== 'audio') return null;
    return s.localUrls[item.assetId] ?? s.undoable.assets[item.assetId]?.url ?? null;
  });
  const videoHasAudio = useEditorStore((s) => {
    if (item.type !== 'video') return false;
    const asset = s.undoable.assets[item.assetId];
    return asset?.type === 'video' && asset.hasAudio;
  });
  const fps = useEditorStore((s) => s.undoable.fps);
  const filename = useEditorStore((s) =>
    item.type === 'video' ? (s.undoable.assets[item.assetId]?.filename ?? null) : null,
  );
  const assetDurationSec = useEditorStore((s) => {
    if (item.type !== 'video' && item.type !== 'audio') return 0;
    const a = s.undoable.assets[item.assetId];
    return a && 'durationInSeconds' in a ? a.durationInSeconds : 0;
  });
  const widthPx = Math.max(2, item.durationInFrames * zoom);
  // 时间锚定参数：胶片/波形对应素材时间窗口，修剪只平移显示、不重新生成
  const trimBeforeSec = 'trimBefore' in item ? item.trimBefore / fps : 0;
  const visibleSec =
    (('playbackRate' in item ? item.playbackRate : 1) * item.durationInFrames) / fps;
  const blockRef = useRef<HTMLDivElement>(null);
  const [volDrag, setVolDrag] = useState<number | null>(null);
  /** 淡变拖拽中的提示：淡入/淡出 + 当前帧数 */
  const [fadeDrag, setFadeDrag] = useState<{ side: 'in' | 'out'; frames: number } | null>(null);

  /** 手柄小拖拽骨架：捕获指针，move 期间 commit:false，抬起 commitPending（一次拖拽 = 一条撤销） */
  const startHandleDrag = (
    e: React.PointerEvent,
    apply: (ev: { clientX: number; clientY: number }) => void,
    onEnd?: () => void,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    apply(e);
    const onMove = (ev: PointerEvent) => apply(ev);
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      onEnd?.();
      useEditorStore.getState().commitPending();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const onVolumePointerDown = (e: React.PointerEvent) => {
    const rect = blockRef.current!.getBoundingClientRect();
    startHandleDrag(
      e,
      (ev) => {
        const vol =
          Math.round(Math.min(1, Math.max(0, 1 - (ev.clientY - rect.top) / rect.height)) * 100) / 100;
        setVolDrag(vol);
        useEditorStore.getState().updateUndoable(
          (s) => {
            const it = s.items[item.id];
            if (!it || (it.type !== 'video' && it.type !== 'audio') || it.volume === vol) return s;
            return { ...s, items: { ...s.items, [item.id]: { ...it, volume: vol } } };
          },
          { commit: false },
        );
      },
      () => setVolDrag(null),
    );
  };

  const onFadePointerDown = (e: React.PointerEvent, side: 'in' | 'out') => {
    const rect = blockRef.current!.getBoundingClientRect();
    startHandleDrag(
      e,
      (ev) => {
        const store = useEditorStore.getState();
        const it = store.undoable.items[item.id];
        if (!it) return;
        const raw =
          side === 'in'
            ? Math.round((ev.clientX - rect.left) / zoom)
            : Math.round((rect.right - ev.clientX) / zoom);
        // 淡入 + 淡出 不超过项时长
        const other = side === 'in' ? it.fadeOutDurationInFrames : it.fadeInDurationInFrames;
        const v = Math.min(Math.max(0, raw), Math.max(0, it.durationInFrames - other));
        setFadeDrag({ side, frames: v });
        const cur = side === 'in' ? it.fadeInDurationInFrames : it.fadeOutDurationInFrames;
        if (cur === v) return;
        store.updateUndoable(
          (s) => {
            const cu = s.items[item.id];
            if (!cu) return s;
            const next =
              side === 'in' ? { ...cu, fadeInDurationInFrames: v } : { ...cu, fadeOutDurationInFrames: v };
            return { ...s, items: { ...s.items, [item.id]: next } };
          },
          { commit: false },
        );
      },
      () => setFadeDrag(null),
    );
  };

  /** 官方样式：顶角白色小药丸（约 6×10px、下缘圆角），悬停或选中时可见 */
  const fadeHandleCls = `absolute top-0 z-30 h-[10px] w-[6px] -translate-x-1/2 cursor-ew-resize rounded-b-full bg-white ${
    selected ? '' : 'opacity-0 group-hover:opacity-100'
  }`;

  return (
    <div
      ref={blockRef}
      data-item-block={item.id}
      className={`group absolute top-1.5 bottom-1.5 cursor-pointer rounded border text-xs text-white/90 ${COLORS[item.type]} ${
        selected ? 'border-[#0B84F3]' : 'border-white/10'
      }`}
      style={{ left: item.from * zoom, width: widthPx, visibility: hidden ? 'hidden' : undefined }}
      onPointerDown={(e) => onPointerDown?.(e, item, 'move')}
    >
      {/* 内容裁剪层：条纹/波形/标签等在此裁剪；修剪手柄留在外层以便悬出块外 */}
      <div className="absolute inset-0 flex items-center overflow-hidden rounded px-2">
      {item.type === 'video' && mediaUrl ? (
        <Filmstrip
          assetId={item.assetId}
          url={mediaUrl}
          widthPx={widthPx}
          assetDurationSec={assetDurationSec}
          trimBeforeSec={trimBeforeSec}
          visibleSec={visibleSec}
        />
      ) : null}
      {item.type === 'audio' && mediaUrl ? (
        <Waveform
          assetId={item.assetId}
          url={mediaUrl}
          widthPx={widthPx}
          assetDurationSec={assetDurationSec}
          trimBeforeSec={trimBeforeSec}
          visibleSec={visibleSec}
        />
      ) : null}
      {/* 视频底部音频波形窄条（无音轨则不渲染） */}
      {item.type === 'video' && videoHasAudio && mediaUrl ? (
        <Waveform
          assetId={item.assetId}
          url={mediaUrl}
          widthPx={widthPx}
          assetDurationSec={assetDurationSec}
          trimBeforeSec={trimBeforeSec}
          visibleSec={visibleSec}
          heightPx={14}
        />
      ) : null}
      {/* 淡入/淡出斜坡 */}
      {item.fadeInDurationInFrames > 0 ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: item.fadeInDurationInFrames * zoom,
            background: 'linear-gradient(to top left, transparent 49.5%, rgba(0,0,0,0.45) 50%)',
          }}
        />
      ) : null}
      {item.fadeOutDurationInFrames > 0 ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{
            width: item.fadeOutDurationInFrames * zoom,
            background: 'linear-gradient(to top right, transparent 49.5%, rgba(0,0,0,0.45) 50%)',
          }}
        />
      ) : null}
      {/* 视频块：左上角显示素材文件名（官方）；其余块居中显示类型标签 */}
      {item.type === 'video' ? (
        filename ? (
          <span className="pointer-events-none absolute left-1 top-0.5 z-10 max-w-[calc(100%-8px)] truncate text-[10px] text-white/90 select-none">
            {filename}
          </span>
        ) : null
      ) : (
        <span className="relative z-10 truncate select-none">{itemLabel(item)}</span>
      )}
      {/* 音量线（上 = 100%，下 = 0%）：1px 白线 + 线下浅灰填充 */}
      {item.type === 'video' || item.type === 'audio' ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-zinc-400/15"
            style={{ top: `${(1 - item.volume) * 100}%` }}
          />
          <div
            data-volume-line
            className="absolute inset-x-0 z-20 flex cursor-ns-resize items-center"
            style={{ top: `calc(${(1 - item.volume) * 100}% - 3px)`, height: 6 }}
            title="音量"
            onPointerDown={onVolumePointerDown}
          >
            <div className="h-px w-full bg-white/25" />
          </div>
        </>
      ) : null}
      {/* 拖拽中的深色提示：音量 dB / 淡入淡出秒数 */}
      {volDrag !== null || fadeDrag !== null ? (
        <div className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] tabular-nums whitespace-nowrap text-white">
          {volDrag !== null
            ? toDb(volDrag)
            : `${fadeDrag!.side === 'in' ? '淡入' : '淡出'} ${(fadeDrag!.frames / fps).toFixed(1)}s`}
        </div>
      ) : null}
      </div>
      {/* 修剪手柄（官方：不可见、6px 宽、向块外悬出 1px；左缘 e-resize、右缘 w-resize） */}
      <div
        data-trim="start"
        className="absolute inset-y-0 -left-px z-30 w-1.5 cursor-e-resize"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e, item, 'trim-start');
        }}
      />
      <div
        data-trim="end"
        className="absolute inset-y-0 -right-px z-30 w-1.5 cursor-w-resize"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e, item, 'trim-end');
        }}
      />
      {/* 淡入/淡出手柄（顶部两角，选中或悬停可见；与边缘修剪手柄错开） */}
      <div
        data-fade="in"
        className={fadeHandleCls}
        style={{ left: item.fadeInDurationInFrames * zoom }}
        title="淡入"
        onPointerDown={(e) => onFadePointerDown(e, 'in')}
      />
      <div
        data-fade="out"
        className={fadeHandleCls}
        style={{ left: widthPx - item.fadeOutDurationInFrames * zoom }}
        title="淡出"
        onPointerDown={(e) => onFadePointerDown(e, 'out')}
      />
    </div>
  );
};
