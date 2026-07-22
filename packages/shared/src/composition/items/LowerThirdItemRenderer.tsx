import type React from 'react';
import { useVideoConfig } from 'remotion';
import type { LowerThirdItem } from '../../types';
import { LOWER_THIRD_DESIGN, LT_REF_ASPECT, OVERLAY_SCALE_FACTORS, hexWithAlpha } from '../../overlay-design';
import { FontGate } from './TextItemRenderer';

// 对齐参考:地址/价格用 IBM Plex Sans,明细用 IBM Plex Mono(见 xchangeai-workbench styles.css)
const SANS = 'IBM Plex Sans';
const MONO = 'IBM Plex Mono';

// 下三分之一卡:整卡在一个 item 里画(左强调条 + 三行:地址/价格/明细)。item 盒 = 卡片矩形本身
// (由消费端按 LOWER_THIRD_DESIGN + position 定位,故点击内容不会误命中满幅);渲染器填满盒即可。
// 内部字号/内边距取自帧尺寸(useVideoConfig),与盒尺寸同源令牌 → 任意分辨率一致。
export const LowerThirdItemRenderer: React.FC<{ item: LowerThirdItem }> = ({ item }) => {
  const { height: H } = useVideoConfig();
  const d = LOWER_THIRD_DESIGN;
  const f = OVERLAY_SCALE_FACTORS[item.scale]; // 尺寸档:字号/内边距/圆角/行距 ×f(卡高由消费端一并 ×f)
  const padX = d.paddingX * LT_REF_ASPECT * H; // 横向量跟帧高(见 LT_REF_ASPECT)→ 任意画幅一致
  const accent = d.accentWidth * LT_REF_ASPECT * H;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        padding: `${d.paddingY * H * f}px ${padX}px`,
        borderLeft: `${accent}px solid ${d.accentColor}`,
        borderRadius: d.cornerRadius * H * f,
        background: hexWithAlpha(item.bgColor, item.bgOpacity),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: d.lineGap * H * f,
        overflow: 'hidden',
      }}
    >
      <FontGate key={SANS} family={SANS} />
      <FontGate key={MONO} family={MONO} />
      {/* 地址最多两行折行(不再省略号截断);卡高由消费端按行数长高,见 video-overlays bannerBox */}
      <span
        style={{
          fontFamily: SANS,
          fontSize: d.addressSize * H * f,
          color: d.addressColor,
          fontWeight: 400,
          lineHeight: 1.2,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          overflowWrap: 'anywhere',
        }}
      >
        {item.address}
      </span>
      <span style={{ fontFamily: SANS, fontSize: d.priceSize * H * f, color: item.textColor, fontWeight: 600, lineHeight: 1.15 }}>
        {item.price}
      </span>
      <span style={{ fontFamily: MONO, fontSize: d.detailsSize * H * f, color: d.detailsColor, fontWeight: 400, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.details}
      </span>
    </div>
  );
};
