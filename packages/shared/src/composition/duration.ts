/** 合成时长 = max(from + durationInFrames)，至少 1 帧；预览与服务端渲染共用 */
export const calcDuration = (
  items: Record<string, { from: number; durationInFrames: number }>,
): number => {
  let max = 1;
  for (const item of Object.values(items)) {
    max = Math.max(max, item.from + item.durationInFrames);
  }
  return max;
};
