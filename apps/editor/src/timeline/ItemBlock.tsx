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

/** 官方格式的 dB 显示：+8.0 dB / 0.0 dB / -∞ dB */
const formatDb = (gain: number): string => {
  if (gain <= 0) return '-∞ dB';
  const d = 20 * Math.log10(gain);
  return `${d > 0 ? '+' : ''}${d.toFixed(1)} dB`;
};

/** 音频条带高度（官方 20px）：波形/音量线/淡变楔形都住在这里 */
const AUDIO_STRIP_H = 20;

/**
 * 音量线纵向位置（官方实测映射，dB 线性）：top% = (20 − dB) / 80，
 * 0dB 在条带 25% 处；顶 = +20dB（10 倍增益）；底 = −∞ 静音。
 */
const gainToTopFraction = (gain: number): number =>
  gain <= 0 ? 1 : Math.min(1, Math.max(0, (20 - 20 * Math.log10(gain)) / 80));
const topFractionToGain = (f: number): number =>
  f >= 1 ? 0 : 10 ** ((20 - 80 * Math.min(1, Math.max(0, f))) / 20);

/** 等功率淡变楔形路径（官方：黑色 SVG，覆盖未达全音量的区域） */
const wedgePath = (w: number, h: number, side: 'in' | 'out'): string => {
  const N = 12;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const gain = Math.sin((Math.PI / 2) * t); // 等功率曲线
    const x = side === 'in' ? t * w : w - t * w;
    pts.push(`L ${x.toFixed(1)} ${(h * (1 - gain)).toFixed(1)}`);
  }
  const x0 = side === 'in' ? 0 : w;
  return `M ${x0} 0 L ${x0} ${h} ${pts.join(' ')} Z`;
};

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
  const stripRef = useRef<HTMLDivElement>(null);
  /** 拖拽中的跟随光标提示（官方：黑色小盒随光标移动） */
  const [dragTip, setDragTip] = useState<{ label: string; x: number; y: number } | null>(null);
  /** 是否渲染底部音频条带（有音轨的媒体块） */
  const hasAudioStrip = item.type === 'audio' || (item.type === 'video' && videoHasAudio);

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
    const rect = stripRef.current!.getBoundingClientRect();
    startHandleDrag(
      e,
      (ev) => {
        const f = (ev.clientY - rect.top) / rect.height;
        const vol = Math.round(topFractionToGain(f) * 10000) / 10000;
        setDragTip({ label: formatDb(vol), x: ev.clientX, y: ev.clientY });
        useEditorStore.getState().updateUndoable(
          (s) => {
            const it = s.items[item.id];
            if (!it || (it.type !== 'video' && it.type !== 'audio') || it.volume === vol) return s;
            return { ...s, items: { ...s.items, [item.id]: { ...it, volume: vol } } };
          },
          { commit: false },
        );
      },
      () => setDragTip(null),
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
        setDragTip({
          label: `${side === 'in' ? '淡入' : '淡出'} ${(v / fps).toFixed(1)}s`,
          x: ev.clientX,
          y: ev.clientY,
        });
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
      () => setDragTip(null),
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
      <div
        className="absolute inset-0 flex items-center overflow-hidden rounded px-2"
        style={hasAudioStrip ? { paddingBottom: AUDIO_STRIP_H } : undefined}
      >
      {item.type === 'video' && mediaUrl ? (
        <div
          className="absolute inset-x-0 top-0"
          style={{ bottom: hasAudioStrip ? AUDIO_STRIP_H : 0 }}
        >
          <Filmstrip
            assetId={item.assetId}
            url={mediaUrl}
            widthPx={widthPx}
            assetDurationSec={assetDurationSec}
            trimBeforeSec={trimBeforeSec}
            visibleSec={visibleSec}
          />
        </div>
      ) : null}
      {/* 音频条带（官方 20px）：波形 + 淡变楔形 + 音量线都住在这里 */}
      {hasAudioStrip && mediaUrl ? (
        <div
          ref={stripRef}
          className="absolute inset-x-0 bottom-0 z-10 bg-black/30"
          style={{ height: AUDIO_STRIP_H }}
        >
          <Waveform
            assetId={item.assetId}
            url={mediaUrl}
            widthPx={widthPx}
            assetDurationSec={assetDurationSec}
            trimBeforeSec={trimBeforeSec}
            visibleSec={visibleSec}
            gain={'volume' in item ? item.volume : 1}
            heightPx={AUDIO_STRIP_H}
          />
          {item.fadeInDurationInFrames > 0 ? (
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={Math.min(widthPx, item.fadeInDurationInFrames * zoom)}
              height={AUDIO_STRIP_H}
            >
              <path
                d={wedgePath(Math.min(widthPx, item.fadeInDurationInFrames * zoom), AUDIO_STRIP_H, 'in')}
                fill="black"
                fillOpacity={0.55}
              />
            </svg>
          ) : null}
          {item.fadeOutDurationInFrames > 0 ? (
            <svg
              className="pointer-events-none absolute right-0 top-0"
              width={Math.min(widthPx, item.fadeOutDurationInFrames * zoom)}
              height={AUDIO_STRIP_H}
            >
              <path
                d={wedgePath(Math.min(widthPx, item.fadeOutDurationInFrames * zoom), AUDIO_STRIP_H, 'out')}
                fill="black"
                fillOpacity={0.55}
              />
            </svg>
          ) : null}
          {/* 音量线：dB 线性映射（0dB 在 25% 处，顶 +20dB，底 −∞）；
              抓取带钳制在条带内（极值处线在带内偏移，避免被块裁剪抓不到） */}
          {(() => {
            const linePx = gainToTopFraction('volume' in item ? item.volume : 1) * AUDIO_STRIP_H;
            const bandTop = Math.min(AUDIO_STRIP_H - 6, Math.max(0, linePx - 3));
            return (
              <div
                data-volume-line
                className="absolute inset-x-0 z-20 cursor-ns-resize"
                style={{ top: bandTop, height: 6 }}
                title="音量"
                onPointerDown={onVolumePointerDown}
              >
                <div
                  className="absolute inset-x-0 h-px bg-white/20"
                  style={{ top: Math.min(5, Math.max(0, linePx - bandTop)) }}
                />
              </div>
            );
          })()}
        </div>
      ) : null}
      {/* 非条带块的淡入/淡出斜坡（视觉元素保留原样式） */}
      {!hasAudioStrip && item.fadeInDurationInFrames > 0 ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: item.fadeInDurationInFrames * zoom,
            background: 'linear-gradient(to top left, transparent 49.5%, rgba(0,0,0,0.45) 50%)',
          }}
        />
      ) : null}
      {!hasAudioStrip && item.fadeOutDurationInFrames > 0 ? (
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
      </div>
      {/* 拖拽中的提示：黑色小盒跟随光标（官方样式） */}
      {dragTip ? (
        <div
          className="pointer-events-none fixed z-50 flex h-[26px] items-center rounded bg-black/90 px-2 text-xs font-medium tabular-nums whitespace-nowrap text-neutral-300"
          style={{ left: dragTip.x + 25, top: dragTip.y - 15 }}
        >
          {dragTip.label}
        </div>
      ) : null}
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
