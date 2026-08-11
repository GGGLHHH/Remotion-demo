import type { Caption } from './captions-types'

/**
 * 整体平移字幕时间（左 trim、切分右半都用它）。
 * 移到负时间的条目**保留**：渲染器只取 startMs <= 当前时间且未过期的页，负的自然不出现；
 * 留着它，块头再拉回来时字幕原样回来 —— 裁剪因此是无损的。
 */
export function shiftCaptions(captions: Caption[], deltaMs: number): Caption[] {
  return deltaMs === 0
    ? captions
    : captions.map(c => ({
        ...c,
        startMs: c.startMs - deltaMs,
        endMs: c.endMs - deltaMs,
        timestampMs: c.timestampMs === null ? null : c.timestampMs - deltaMs,
      }))
}

/** 整条只有标点(允许前后空白) */
const PURE_PUNCT = /^[,.!?;:'"()[\]{}…—–、，。！？；：「」『』（）【】-]+$/

/**
 * 把「整条只有标点」的 token 并进前一条。
 *
 * whisper 与很多字幕文件都会把句读单独成条（常是零时长的 "." ","）。不合并有两个后果：
 *  1. @remotion/captions 分页可能正好切在它前面 → 屏幕上出现以「.」开头的一页（`.,.,From here…`）；
 *  2. whisper 直出的 token 自带前导空格，标点也带 → 渲染成「gatherings . , . , From」。
 * 合并时抹掉标点自身的前导空格，让它紧贴所属的词；时间取两者较晚的结束。
 *
 * 放在 shared 而不是导入解析里，是因为坏数据有多个来源（whisper 转录、导入、外部灌进来的 state），
 * 在渲染前统一过一遍才能一处管全部 —— 包括已经存过盘的旧字幕。
 * 幂等：跑过一遍的数据再跑不会变。无变化时返回原数组引用（渲染器 useMemo 依赖它）。
 */
export function mergeCaptionPunctuation(captions: Caption[]): Caption[] {
  const out: Caption[] = []
  let changed = false
  for (const c of captions) {
    const prev = out.at(-1)
    const t = c.text.trim()
    if (prev && t && PURE_PUNCT.test(t)) {
      // 前一条已经以标点收尾 ⇒ 这条是 whisper 在同一处重复吐的噪声（截图里的「.,.,」），丢掉。
      // 只丢「独立成条」的重复：合法的省略号/「?!」whisper 是放在一条里的（"…" / "?!"），不受影响。
      const tail = prev.text.trim().slice(-1)
      const add = PURE_PUNCT.test(tail) ? '' : t
      out[out.length - 1] = { ...prev, text: prev.text + add, endMs: Math.max(prev.endMs, c.endMs) }
      changed = true
    }
    else {
      out.push(c)
    }
  }
  return changed ? out : captions
}
