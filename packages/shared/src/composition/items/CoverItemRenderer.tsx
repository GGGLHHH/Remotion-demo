import type React from 'react';
import { useVideoConfig } from 'remotion';
import type { CoverItem } from '../../types';
import { COVER_DESIGN, OVERLAY_SCALE_FACTORS } from '../../overlay-design';
import { FontGate } from './TextItemRenderer';

// 对齐参考 CoverFrame:眉标/副标题用 IBM Plex Mono(带字距),标题/价格用 IBM Plex Sans 600
const SANS = 'IBM Plex Sans';
const MONO = 'IBM Plex Mono';

// 封面卡:满幅底 + 居中标题卡(眉标 / 标题 / 价格 / 副标题)。字号取帧高分数。
export const CoverItemRenderer: React.FC<{ item: CoverItem }> = ({ item }) => {
  const { height: H } = useVideoConfig();
  const c = COVER_DESIGN;
  const f = OVERLAY_SCALE_FACTORS[item.scale]; // 尺寸档:所有封面文字字号 ×f
  const lines: Array<{ text: string; fontSize: number; color: string; weight: number; ls: number; font: string }> = [];
  if (item.eyebrow) lines.push({ text: item.eyebrow, fontSize: c.eyebrowSize * H * f, color: c.eyebrowColor, weight: 500, ls: c.eyebrowSize * H * f * 0.2, font: MONO });
  if (item.title) lines.push({ text: item.title, fontSize: c.titleSize * H * f, color: '#ffffff', weight: 600, ls: 0, font: SANS });
  if (item.price) lines.push({ text: item.price, fontSize: c.priceSize * H * f, color: '#ffffff', weight: 600, ls: 0, font: SANS });
  if (item.subtitle) lines.push({ text: item.subtitle, fontSize: c.subSize * H * f, color: c.subtitleColor, weight: 400, ls: 0, font: MONO });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: item.bgColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: c.gap * H,
        padding: '0 8%',
        textAlign: 'center',
      }}
    >
      <FontGate key={SANS} family={SANS} />
      <FontGate key={MONO} family={MONO} />
      {lines.map((l, i) => (
        <span key={i} style={{ fontFamily: l.font, fontSize: l.fontSize, color: l.color, fontWeight: l.weight, letterSpacing: l.ls, lineHeight: 1.2, maxWidth: '100%', overflowWrap: 'anywhere' }}>
          {l.text}
        </span>
      ))}
    </div>
  );
};
