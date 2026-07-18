import type React from 'react';
import { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';
import type { Caption } from '../../captions-types';
import type { CaptionsItem } from '../../types';
import { FontGate } from './TextItemRenderer';

/** TikTok 分页字幕 + 当前词高亮。
 * ponytail: 字幕时间戳相对素材起点，item 与源 item 同 from 即对齐；忽略源 item 的 trim/变速偏移 */
export const CaptionsItemRenderer: React.FC<{ item: CaptionsItem; captions: Caption[] }> = ({
  item,
  captions,
}) => {
  const frame = useCurrentFrame(); // Sequence 内：0 = item 开始
  const { fps } = useVideoConfig();
  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: item.pageDurationInMs,
      }),
    [captions, item.pageDurationInMs],
  );

  const timeMs = (frame / fps) * 1000;
  const page = pages.filter((p) => p.startMs <= timeMs).at(-1);
  if (!page || timeMs > page.startMs + page.durationMs) return null;

  return (
    <div
      data-captions-item
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          item.textAlign === 'left'
            ? 'flex-start'
            : item.textAlign === 'right'
              ? 'flex-end'
              : 'center',
        direction: item.direction,
      }}
    >
      <FontGate key={item.fontFamily} family={item.fontFamily} />
      <div
        style={{
          fontFamily: item.fontFamily,
          fontWeight: item.fontWeight,
          fontStyle: item.fontStyle,
          fontSize: item.fontSize,
          color: item.color,
          lineHeight: item.lineHeight,
          letterSpacing: item.letterSpacing,
          textAlign: item.textAlign,
          whiteSpace: 'pre-wrap', // token 自带前导空格
          width: '100%',
          WebkitTextStroke:
            item.strokeWidth > 0 ? `${item.strokeWidth}px ${item.strokeColor}` : undefined,
          // 原生 line-clamp 裁掉超出 maxLines 的行
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: item.maxLines,
          overflow: 'hidden',
        }}
      >
        {page.tokens.map((token) => {
          const active = token.fromMs <= timeMs && token.toMs > timeMs;
          return (
            <span key={token.fromMs} style={{ color: active ? item.highlightColor : undefined }}>
              {token.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
