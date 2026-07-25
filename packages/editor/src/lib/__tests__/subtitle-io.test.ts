import { describe, expect, it } from 'vitest';
import { parseSubtitles, serializeSubtitles } from '../subtitle-io';

describe('parseSubtitles', () => {
  it('解析 SRT（逗号毫秒 + 序号行 + CRLF）', () => {
    const srt = '1\r\n00:00:01,500 --> 00:00:04,000\r\nHello world\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,250\r\n第二句\r\n';
    expect(parseSubtitles(srt)).toEqual([
      { text: 'Hello world', startMs: 1500, endMs: 4000, timestampMs: 1500, confidence: null },
      { text: ' 第二句', startMs: 4000, endMs: 6250, timestampMs: 4000, confidence: null },
    ]);
  });

  it('解析 WebVTT：点分隔符、WEBVTT 头、NOTE 块、无序号行、省略小时', () => {
    const vtt = 'WEBVTT\n\nNOTE this is a comment\n\n00:01.000 --> 00:03.000\nfirst\n\n00:00:03.000 --> 00:00:05.000\nsecond\n';
    expect(parseSubtitles(vtt)).toEqual([
      { text: 'first', startMs: 1000, endMs: 3000, timestampMs: 1000, confidence: null },
      { text: ' second', startMs: 3000, endMs: 5000, timestampMs: 3000, confidence: null },
    ]);
  });

  it('多行正文合并为一条，内联标签被剥掉', () => {
    const vtt = '00:00:00.000 --> 00:00:02.000\n<c.yellow>line one</c>\nline two\n';
    expect(parseSubtitles(vtt)).toEqual([
      { text: 'line one line two', startMs: 0, endMs: 2000, timestampMs: 0, confidence: null },
    ]);
  });

  it('空文件 / 无时间轴的文本返回空数组而不抛错', () => {
    expect(parseSubtitles('')).toEqual([]);
    expect(parseSubtitles('WEBVTT\n\n随便一段没有时间轴的文字\n')).toEqual([]);
  });

  it('乱序的条目按开始时间排序', () => {
    const srt = '1\n00:00:05,000 --> 00:00:06,000\nlater\n\n2\n00:00:01,000 --> 00:00:02,000\nearlier\n';
    expect(parseSubtitles(srt).map((c) => c.text)).toEqual(['earlier', ' later']);
  });

  it('标点单独成条时不补空格 —— whisper 逐词导出的 SRT 就长这样', () => {
    const srt =
      '1\n00:00:00,010 --> 00:00:00,460\nThank\n\n2\n00:00:00,460 --> 00:00:01,040\nyou\n\n3\n00:00:01,040 --> 00:00:01,040\n.\n\n4\n00:00:01,040 --> 00:00:01,160\nAs\n';
    const texts = parseSubtitles(srt).map((c) => c.text);
    // 纯标点并进前一条：否则分页可能切在它前面，屏幕上出现以「.」开头的一页
    expect(texts).toEqual(['Thank', ' you.', ' As']);
    expect(texts.join('')).toBe('Thank you. As');
  });

  it('合并标点时取两者较晚的结束时间', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\nyou\n\n2\n00:00:01,000 --> 00:00:01,500\n.\n';
    expect(parseSubtitles(srt)).toEqual([
      { text: 'you.', startMs: 0, endMs: 1500, timestampMs: 0, confidence: null },
    ]);
  });

  it('首条外每条都带前导空格 —— @remotion/captions 靠它断页', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\na\n\n2\n00:00:01,000 --> 00:00:02,000\nb\n\n3\n00:00:02,000 --> 00:00:03,000\nc\n';
    expect(parseSubtitles(srt).map((c) => c.text)).toEqual(['a', ' b', ' c']);
  });
});

describe('serializeSubtitles', () => {
  it('输出标准 SRT，断句用的前导空格不进文件', () => {
    const srt = serializeSubtitles([
      { text: 'first', startMs: 0, endMs: 1500, timestampMs: 0, confidence: null },
      { text: ' second', startMs: 1500, endMs: 3725, timestampMs: 1500, confidence: null },
    ]);
    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nfirst\n\n2\n00:00:01,500 --> 00:00:03,725\nsecond\n',
    );
  });

  it('导出再导入回到同一组时间与文本（往返）', () => {
    const original = parseSubtitles(
      '1\n00:01:02,340 --> 00:01:05,000\n第一句\n\n2\n00:01:05,000 --> 00:01:07,890\nsecond one\n',
    );
    expect(parseSubtitles(serializeSubtitles(original))).toEqual(original);
  });

  it('空字幕导出为空文件而不抛错', () => {
    expect(serializeSubtitles([]).trim()).toBe('');
  });

  // 裁剪是无损的（条目留在负时间），但负时间戳写不进 SRT —— 曾经导出成「-1:-1:-2,-500」
  it('导出时按块边界截断负时间，不产出非法时间戳', () => {
    const srt = serializeSubtitles([
      { text: 'cut away', startMs: -1500, endMs: -500, timestampMs: -1500, confidence: null },
      { text: ' half in', startMs: -300, endMs: 700, timestampMs: -300, confidence: null },
      { text: ' kept', startMs: 1000, endMs: 1800, timestampMs: 1000, confidence: null },
    ]);
    expect(srt).not.toMatch(/-\d/); // 任何位置都不该出现负号
    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:00,700\nhalf in\n\n2\n00:00:01,000 --> 00:00:01,800\nkept\n',
    );
  });

  it('整条都在块外的条目被丢掉，序号仍连续', () => {
    const srt = serializeSubtitles([
      { text: 'gone', startMs: -2000, endMs: -1000, timestampMs: -2000, confidence: null },
      { text: ' a', startMs: 0, endMs: 500, timestampMs: 0, confidence: null },
      { text: ' b', startMs: 500, endMs: 900, timestampMs: 500, confidence: null },
    ]);
    expect(srt.match(/^\d+$/gm)).toEqual(['1', '2']);
  });
});
