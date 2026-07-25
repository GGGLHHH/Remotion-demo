import { mergeCaptionPunctuation, type Caption } from '@gedatou/shared';

/** `[hh:]mm:ss[,.]mmm --> [hh:]mm:ss[,.]mmm`：SRT 用逗号、WebVTT 用点，小时段两者都可省 */
const CUE =
  /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

const toMs = (h: string | undefined, m: string, s: string, ms: string): number =>
  (Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(ms.padEnd(3, '0'));

/**
 * SRT / WebVTT → Caption[]。
 *
 * 不用 @remotion/captions 的 parseSrt：它只认逗号毫秒分隔符（吃不下 VTT），
 * 且遇到不以序号开头的文件（WEBVTT 头、BOM）会在空数组上取 [-1] 抛错。
 *
 * 扫描规则够覆盖两种格式：含 `-->` 的行给出这条的时间，其后到空行为止的行是正文。
 * 序号行、WEBVTT 头、NOTE/STYLE 块都不匹配 CUE，天然被跳过。
 */
export const parseSubtitles = (input: string): Caption[] => {
  const lines = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const out: Caption[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = CUE.exec(lines[i]);
    if (!m) continue;
    const startMs = toMs(m[1], m[2], m[3], m[4]);
    const endMs = toMs(m[5], m[6], m[7], m[8]);
    const body: string[] = [];
    while (++i < lines.length && lines[i].trim() !== '') body.push(lines[i].trim());
    // 去掉 VTT 的 <c>/<b>/<00:00:01.000> 之类内联标签，只留纯文本
    const text = body.join(' ').replace(/<[^>]*>/g, '').trim();
    if (text) out.push({ text, startMs, endMs, timestampMs: startMs, confidence: null });
  }
  // 前导空格是 @remotion/captions 的断句协议:createTikTokStyleCaptions 只在 text.startsWith(' ')
  // 时才开新页（whisper 的逐词 token 天然带空格，SRT/VTT 不带）。不补这个空格，整个文件会被
  // 拼成一页糊在屏幕上。首条不加 —— 它本来就是第一页的开头。
  // 标点也不加：whisper 逐词导出的 SRT 会把 "." "," 单独成条，加了空格渲染出来是「you . As」。
  return mergeCaptionPunctuation(out.sort((a, b) => a.startMs - b.startMs)).map((c, i) =>
    i === 0 || LEADING_PUNCT.test(c.text) ? c : { ...c, text: ` ${c.text}` },
  );
};

/** 开头是标点（含中日韩全角）的条目不补前导空格 */
const LEADING_PUNCT = /^[,.!?;:'")\]}…—–、，。！？；：」』）】]/;

const srtTime = (ms: number): string => {
  const p = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
  return `${p(ms / 3600000)}:${p((ms % 3600000) / 60000)}:${p((ms % 60000) / 1000)},${p(ms % 1000, 3)}`;
};

/**
 * Caption[] → SRT 文本。
 *
 * 不用 @remotion/captions 的 serializeSrt：editor 包不依赖它（只有 shared 依赖），
 * 而且它按 Caption[][] 分组、不抹前导空格——那个空格是内部断句协议，不该漏进导出文件。
 */
export const serializeSubtitles = (captions: Caption[]): string =>
  captions
    // 裁剪是无损的（被裁掉的条目留在负时间，见 shiftCaptions），但负时间戳写不进 SRT ——
    // 格式化出来是「-1:-1:-2,-500」这种任何播放器都读不了的东西。导出时按块边界截断：
    // 整条在块外的丢掉，跨边界的把头按到 0。
    .filter((c) => c.endMs > 0)
    .map((c, i) => {
      const startMs = Math.max(0, c.startMs);
      return `${i + 1}\n${srtTime(startMs)} --> ${srtTime(c.endMs)}\n${c.text.trimStart()}`;
    })
    .join('\n\n') + '\n';
