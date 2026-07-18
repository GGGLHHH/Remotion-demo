import type React from 'react';
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
  const widthPx = Math.max(2, item.durationInFrames * zoom);

  return (
    <div
      data-item-block={item.id}
      className={`absolute top-1.5 bottom-1.5 flex cursor-grab items-center overflow-hidden rounded border px-2 text-xs text-white/90 ${COLORS[item.type]} ${
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
      <span className="relative z-10 truncate select-none">{itemLabel(item)}</span>
      {/* 修剪手柄 */}
      <div
        data-trim="start"
        className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e, item, 'trim-start');
        }}
      />
      <div
        data-trim="end"
        className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e, item, 'trim-end');
        }}
      />
    </div>
  );
};
