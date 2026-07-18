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
      {/* 官方样式：蓝色竖线 + 标尺区内的蓝色小把手 */}
      <div className="mx-auto h-full w-px bg-[#0B84F3]" />
      <div className="absolute top-[5px] left-1/2 h-[14px] w-[7px] -translate-x-1/2 rounded-[2px] bg-[#0B84F3]" />
    </div>
  );
};
