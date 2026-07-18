import type React from 'react';

export const Playhead: React.FC<{ frame: number; zoom: number; onSeek: (frame: number) => void }> = ({
  frame,
  zoom,
  onSeek,
}) => {
  return (
    <div
      className="absolute bottom-0 top-0 z-20 -ml-1 w-2 cursor-ew-resize"
      style={{ left: frame * zoom }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        if (e.buttons !== 1) return;
        const parent = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        onSeek(Math.max(0, Math.round((e.clientX - parent.left) / zoom)));
      }}
    >
      <div className="mx-auto h-full w-px bg-red-500" />
      <div className="absolute -top-0 left-1/2 size-2 -translate-x-1/2 rounded-sm bg-red-500" />
    </div>
  );
};
