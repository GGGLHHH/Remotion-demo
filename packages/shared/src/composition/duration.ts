import { dictValues } from '../dict'

/** 合成时长 = max(from + durationInFrames)，至少 1 帧；预览与服务端渲染共用 */
export function calcDuration(
  items: Record<string, { from: number, durationInFrames: number } | undefined>,
): number {
  let max = 1
  for (const item of dictValues(items)) {
    max = Math.max(max, item.from + item.durationInFrames)
  }
  return max
}
