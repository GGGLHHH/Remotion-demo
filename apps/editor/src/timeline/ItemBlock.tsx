import type React from 'react';
import { useRef, useState } from 'react';
import type { EditorStarterItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { Filmstrip } from './Filmstrip';
import { Waveform } from './Waveform';

const COLORS: Record<EditorStarterItem['type'], string> = {
  solid: 'bg-blue-600/80 border-blue-400',
  text: 'bg-purple-600/80 border-purple-400',
  video: 'bg-teal-600/80 border-teal-400',
  audio: 'bg-emerald-600/80 border-emerald-400',
  image: 'bg-amber-600/80 border-amber-400',
  gif: 'bg-pink-600/80 border-pink-400',
  captions: 'bg-rose-600/80 border-rose-400',
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
  onPointerDown?: (e: React.PointerEvent, item: EditorStarterItem, mode: 'move' | 'trim-start' | 'trim-end') => void;
}> = ({ item, zoom, onPointerDown }) => {
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
  const widthPx = Math.max(2, item.durationInFrames * zoom);
  const blockRef = useRef<HTMLDivElement>(null);
  const [volDrag, setVolDrag] = useState<number | null>(null);

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
    startHandleDrag(e, (ev) => {
      useEditorStore.getState().updateUndoable(
        (s) => {
          const it = s.items[item.id];
          if (!it) return s;
          const raw =
            side === 'in'
              ? Math.round((ev.clientX - rect.left) / zoom)
              : Math.round((rect.right - ev.clientX) / zoom);
          // 淡入 + 淡出 不超过项时长
          const other = side === 'in' ? it.fadeOutDurationInFrames : it.fadeInDurationInFrames;
          const v = Math.min(Math.max(0, raw), Math.max(0, it.durationInFrames - other));
          const cur = side === 'in' ? it.fadeInDurationInFrames : it.fadeOutDurationInFrames;
          if (cur === v) return s;
          const next =
            side === 'in' ? { ...it, fadeInDurationInFrames: v } : { ...it, fadeOutDurationInFrames: v };
          return { ...s, items: { ...s.items, [item.id]: next } };
        },
        { commit: false },
      );
    });
  };

  const fadeHandleCls = `absolute top-0.5 z-30 h-2.5 w-2.5 -translate-x-1/2 cursor-ew-resize rounded-full border border-white bg-black/60 ${
    selected ? '' : 'opacity-0 group-hover:opacity-100'
  }`;

  return (
    <div
      ref={blockRef}
      data-item-block={item.id}
      className={`group absolute top-1.5 bottom-1.5 flex cursor-grab items-center overflow-hidden rounded border px-2 text-xs text-white/90 ${COLORS[item.type]} ${
        selected ? 'ring-2 ring-white' : ''
      }`}
      style={{ left: item.from * zoom, width: widthPx }}
      onPointerDown={(e) => onPointerDown?.(e, item, 'move')}
    >
      {item.type === 'video' && mediaUrl ? (
        <Filmstrip assetId={item.assetId} url={mediaUrl} widthPx={widthPx} />
      ) : null}
      {item.type === 'audio' && mediaUrl ? (
        <Waveform assetId={item.assetId} url={mediaUrl} widthPx={widthPx} />
      ) : null}
      {/* 视频底部音频波形窄条（无音轨则不渲染） */}
      {item.type === 'video' && videoHasAudio && mediaUrl ? (
        <Waveform assetId={item.assetId} url={mediaUrl} widthPx={widthPx} heightPx={14} />
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
      <span className="relative z-10 truncate select-none">{itemLabel(item)}</span>
      {/* 音量线（上 = 100%，下 = 0%） */}
      {item.type === 'video' || item.type === 'audio' ? (
        <div
          data-volume-line
          className="absolute inset-x-0 z-20 flex cursor-ns-resize items-center"
          style={{ top: `calc(${(1 - item.volume) * 100}% - 3px)`, height: 6 }}
          title="音量"
          onPointerDown={onVolumePointerDown}
        >
          <div className="h-[1.5px] w-full bg-yellow-300/90" />
        </div>
      ) : null}
      {volDrag !== null ? (
        <div className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] tabular-nums whitespace-nowrap">
          {Math.round(volDrag * 100)}% · {toDb(volDrag)}
        </div>
      ) : null}
      {/* 修剪手柄 */}
      <div
        data-trim="start"
        className="absolute inset-y-0 left-0 z-30 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e, item, 'trim-start');
        }}
      />
      <div
        data-trim="end"
        className="absolute inset-y-0 right-0 z-30 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40"
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
