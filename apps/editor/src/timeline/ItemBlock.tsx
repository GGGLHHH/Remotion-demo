import type React from 'react';
import { memo, useRef, useState } from 'react';
import type { EditorStarterItem } from '@gedatou/shared';
import { useEditor, useEditorApi } from '../state/context';
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

/**
 * 淡变对（官方实测）：视频块有两组手柄——块顶角驱动视觉对（基础字段），
 * 音频条带上缘两角驱动独立的音频对；音频块单组（基础对即其音频淡变）。
 */
type FadePairKind = 'visual' | 'audio';

const readFadePair = (
  it: EditorStarterItem,
  kind: FadePairKind,
): { fadeIn: number; fadeOut: number } =>
  kind === 'audio' && it.type === 'video'
    ? { fadeIn: it.audioFadeInDurationInFrames ?? 0, fadeOut: it.audioFadeOutDurationInFrames ?? 0 }
    : { fadeIn: it.fadeInDurationInFrames, fadeOut: it.fadeOutDurationInFrames };

const writeFade = (
  it: EditorStarterItem,
  kind: FadePairKind,
  side: 'in' | 'out',
  v: number,
): EditorStarterItem =>
  kind === 'audio' && it.type === 'video'
    ? side === 'in'
      ? { ...it, audioFadeInDurationInFrames: v }
      : { ...it, audioFadeOutDurationInFrames: v }
    : side === 'in'
      ? { ...it, fadeInDurationInFrames: v }
      : { ...it, fadeOutDurationInFrames: v };

/** 音频块整块波形高度（官方：音频块 46px 全波形，行高 48） */
const AUDIO_ITEM_WAVE_H = 44;
/** 视频块胶片区高度（68 块 − 2 边框 − 20 条带） */
const VIDEO_FILM_H = 46;

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

/** memo：props 恒定（item 引用仅真实编辑时变化、onPointerDown 引用恒定），
    面板因时间码/剪刀态等重渲时所有块整体跳过（胶片/波形不重建元素树） */
export const ItemBlock = memo<{
  item: EditorStarterItem;
  zoom: number;
  /** move 拖拽中隐藏原块（不卸载，保持指针捕获与布局） */
  hidden?: boolean;
  onPointerDown?: (e: React.PointerEvent, item: EditorStarterItem, mode: 'move' | 'trim-start' | 'trim-end') => void;
}>(function ItemBlock({ item, zoom, hidden, onPointerDown }) {
  const editorApi = useEditorApi();
  const selected = useEditor((s) => s.selectedItemIds.includes(item.id));
  const mediaUrl = useEditor((s) => {
    if (item.type !== 'video' && item.type !== 'audio') return null;
    return s.localUrls[item.assetId] ?? s.undoable.assets[item.assetId]?.url ?? null;
  });
  const videoHasAudio = useEditor((s) => {
    if (item.type !== 'video') return false;
    const asset = s.undoable.assets[item.assetId];
    return asset?.type === 'video' && asset.hasAudio;
  });
  const fps = useEditor((s) => s.undoable.fps);
  const filename = useEditor((s) =>
    item.type === 'video' || item.type === 'audio'
      ? (s.undoable.assets[item.assetId]?.filename ?? null)
      : null,
  );
  const assetDurationSec = useEditor((s) => {
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
  /** 视频块是否渲染底部音频条带；音频块整块即波形区（官方布局） */
  const hasAudioStrip = item.type === 'video' && videoHasAudio;
  const isAudio = item.type === 'audio';
  const visualFade = readFadePair(item, 'visual');
  const audioFade = readFadePair(item, 'audio');

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
      editorApi.getState().commitPending();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const onVolumePointerDown = (e: React.PointerEvent) => {
    // 与修剪手柄一致：按下即独占选中
    editorApi.getState().setSelected([item.id]);
    const rect = stripRef.current!.getBoundingClientRect();
    startHandleDrag(
      e,
      (ev) => {
        const f = (ev.clientY - rect.top) / rect.height;
        const vol = Math.round(topFractionToGain(f) * 10000) / 10000;
        setDragTip({ label: formatDb(vol), x: ev.clientX, y: ev.clientY });
        editorApi.getState().updateUndoable(
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

  const onFadePointerDown = (e: React.PointerEvent, side: 'in' | 'out', kind: FadePairKind) => {
    editorApi.getState().setSelected([item.id]);
    const rect = blockRef.current!.getBoundingClientRect();
    startHandleDrag(
      e,
      (ev) => {
        const store = editorApi.getState();
        const it = store.undoable.items[item.id];
        if (!it) return;
        const raw =
          side === 'in'
            ? Math.round((ev.clientX - rect.left) / zoom)
            : Math.round((rect.right - ev.clientX) / zoom);
        // 淡入 + 淡出 不超过项时长
        const pair = readFadePair(it, kind);
        const other = side === 'in' ? pair.fadeOut : pair.fadeIn;
        const v = Math.min(Math.max(0, raw), Math.max(0, it.durationInFrames - other));
        setDragTip({
          label: `${side === 'in' ? '淡入' : '淡出'} ${(v / fps).toFixed(1)}s`,
          x: ev.clientX,
          y: ev.clientY,
        });
        if ((side === 'in' ? pair.fadeIn : pair.fadeOut) === v) return;
        store.updateUndoable(
          (s) => {
            const cu = s.items[item.id];
            if (!cu) return s;
            return { ...s, items: { ...s.items, [item.id]: writeFade(cu, kind, side, v) } };
          },
          { commit: false },
        );
      },
      () => setDragTip(null),
    );
  };

  /** 悬停域（官方：悬停胶片区只显视觉角标，悬停音频区只显音频角标） */
  const [hoverZone, setHoverZone] = useState<'film' | 'strip' | null>(null);
  const [blockHover, setBlockHover] = useState(false);

  /** 淡变角标（官方：6×10 白色药丸、下缘圆角）。块级 z-40 渲染在修剪手柄之上——
      官方的边缘热区分层：顶部 ~10px 归淡变、其余归修剪 */
  const fadePill = (
    side: 'in' | 'out',
    kind: FadePairKind,
    frames: number,
    visible: boolean,
    dataAttr: string,
    styleExtra?: React.CSSProperties,
  ) => (
    <div
      {...{ [dataAttr]: side }}
      className={`absolute z-40 h-[10px] w-[6px] cursor-ew-resize rounded-b-full bg-white/90 ${
        selected || visible ? '' : 'opacity-0'
      }`}
      style={{
        ...(side === 'in' ? { left: frames * zoom } : { right: frames * zoom }),
        ...(styleExtra ?? { top: 0 }),
      }}
      title={side === 'in' ? '淡入' : '淡出'}
      onPointerEnter={() => {
        // 悬停在药丸自身时保持所属悬停域（药丸在块级、不在域容器内）
        if (item.type === 'video') setHoverZone(kind === 'visual' ? 'film' : 'strip');
      }}
      onPointerDown={(e) => onFadePointerDown(e, side, kind)}
    />
  );

  return (
    <div
      ref={blockRef}
      data-item-block={item.id}
      className={`group absolute top-px bottom-px cursor-pointer rounded border text-xs text-white/90 ${COLORS[item.type]} ${
        selected ? 'border-[#0B84F3]' : 'border-white/10'
      }`}
      style={{ left: item.from * zoom, width: widthPx, visibility: hidden ? 'hidden' : undefined }}
      onPointerDown={(e) => onPointerDown?.(e, item, 'move')}
      onPointerEnter={() => setBlockHover(true)}
      onPointerLeave={() => {
        setBlockHover(false);
        setHoverZone(null);
      }}
    >
      {/* 内容裁剪层：条纹/波形/标签等在此裁剪；修剪手柄留在外层以便悬出块外 */}
      <div
        className="absolute inset-0 flex items-center overflow-hidden rounded px-2"
        style={hasAudioStrip ? { paddingBottom: AUDIO_STRIP_H } : undefined}
      >
      {item.type === 'video' && mediaUrl ? (
        // 胶片区（悬停域 film）：视觉淡变的楔形住在这里（官方顶角一组）
        <div
          className="absolute inset-x-0 top-0"
          style={{ bottom: hasAudioStrip ? AUDIO_STRIP_H : 0 }}
          onPointerEnter={() => setHoverZone('film')}
        >
          <Filmstrip
            assetId={item.assetId}
            url={mediaUrl}
            widthPx={widthPx}
            assetDurationSec={assetDurationSec}
            trimBeforeSec={trimBeforeSec}
            visibleSec={visibleSec}
          />
          {visualFade.fadeIn > 0 ? (
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={Math.min(widthPx, visualFade.fadeIn * zoom)}
              height={VIDEO_FILM_H}
            >
              <path
                d={wedgePath(Math.min(widthPx, visualFade.fadeIn * zoom), VIDEO_FILM_H, 'in')}
                fill="black"
                fillOpacity={0.55}
              />
            </svg>
          ) : null}
          {visualFade.fadeOut > 0 ? (
            <svg
              className="pointer-events-none absolute right-0 top-0"
              width={Math.min(widthPx, visualFade.fadeOut * zoom)}
              height={VIDEO_FILM_H}
            >
              <path
                d={wedgePath(Math.min(widthPx, visualFade.fadeOut * zoom), VIDEO_FILM_H, 'out')}
                fill="black"
                fillOpacity={0.55}
              />
            </svg>
          ) : null}
        </div>
      ) : null}
      {/* 音频区（group/strip 悬停域）：视频 = 底部 20px 条带；音频块 = 整块波形（官方布局）。
          波形 + 音频淡变楔形/角标 + 音量线都住在这里 */}
      {(hasAudioStrip || isAudio) && mediaUrl
        ? (() => {
            const stripH = isAudio ? AUDIO_ITEM_WAVE_H : AUDIO_STRIP_H;
            const linePx = gainToTopFraction('volume' in item ? item.volume : 1) * stripH;
            const bandTop = Math.min(stripH - 6, Math.max(0, linePx - 3));
            return (
              <div
                ref={stripRef}
                className={`absolute inset-x-0 bottom-0 z-10 ${isAudio ? '' : 'bg-black/30'}`}
                style={{ height: stripH }}
                onPointerEnter={() => setHoverZone('strip')}
              >
                <Waveform
                  assetId={item.assetId}
                  url={mediaUrl}
                  widthPx={widthPx}
                  assetDurationSec={assetDurationSec}
                  trimBeforeSec={trimBeforeSec}
                  visibleSec={visibleSec}
                  gain={'volume' in item ? item.volume : 1}
                  heightPx={stripH}
                />
                {audioFade.fadeIn > 0 ? (
                  <svg
                    className="pointer-events-none absolute left-0 top-0"
                    width={Math.min(widthPx, audioFade.fadeIn * zoom)}
                    height={stripH}
                  >
                    <path
                      d={wedgePath(Math.min(widthPx, audioFade.fadeIn * zoom), stripH, 'in')}
                      fill="black"
                      fillOpacity={0.55}
                    />
                  </svg>
                ) : null}
                {audioFade.fadeOut > 0 ? (
                  <svg
                    className="pointer-events-none absolute right-0 top-0"
                    width={Math.min(widthPx, audioFade.fadeOut * zoom)}
                    height={stripH}
                  >
                    <path
                      d={wedgePath(Math.min(widthPx, audioFade.fadeOut * zoom), stripH, 'out')}
                      fill="black"
                      fillOpacity={0.55}
                    />
                  </svg>
                ) : null}
                {/* 音量线：dB 线性映射（0dB 在 25% 处，顶 +20dB，底 −∞）；
                    抓取带钳制在区域内（极值处线在带内偏移，避免被块裁剪抓不到） */}
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
              </div>
            );
          })()
        : null}
      {/* 非媒体块的淡入/淡出斜坡（视觉淡变对） */}
      {!hasAudioStrip && !isAudio && visualFade.fadeIn > 0 ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: visualFade.fadeIn * zoom,
            background: 'linear-gradient(to top left, transparent 49.5%, rgba(0,0,0,0.45) 50%)',
          }}
        />
      ) : null}
      {!hasAudioStrip && !isAudio && visualFade.fadeOut > 0 ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{
            width: visualFade.fadeOut * zoom,
            background: 'linear-gradient(to top right, transparent 49.5%, rgba(0,0,0,0.45) 50%)',
          }}
        />
      ) : null}
      {/* 视频/音频块：左上角显示素材文件名（官方）；其余块居中显示类型标签 */}
      {item.type === 'video' || isAudio ? (
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
      {/* 淡变角标（块级 z-40，在修剪手柄之上；官方边缘热区：顶部 ~10px 归淡变）。
          视频两组：顶角 = 视觉对（悬停胶片区可见）、音频条带上缘 = 音频对（悬停条带可见）；
          音频块单组 = 音频对；非媒体块单组 = 视觉对 */}
      {item.type === 'video' ? (
        <>
          {fadePill('in', 'visual', visualFade.fadeIn, hoverZone === 'film', 'data-fade')}
          {fadePill('out', 'visual', visualFade.fadeOut, hoverZone === 'film', 'data-fade')}
          {hasAudioStrip
            ? fadePill('in', 'audio', audioFade.fadeIn, hoverZone === 'strip', 'data-fade-audio', {
                bottom: AUDIO_STRIP_H - 10,
              })
            : null}
          {hasAudioStrip
            ? fadePill('out', 'audio', audioFade.fadeOut, hoverZone === 'strip', 'data-fade-audio', {
                bottom: AUDIO_STRIP_H - 10,
              })
            : null}
        </>
      ) : (
        <>
          {fadePill('in', isAudio ? 'audio' : 'visual', visualFade.fadeIn, blockHover, 'data-fade')}
          {fadePill('out', isAudio ? 'audio' : 'visual', visualFade.fadeOut, blockHover, 'data-fade')}
        </>
      )}
    </div>
  );
});
