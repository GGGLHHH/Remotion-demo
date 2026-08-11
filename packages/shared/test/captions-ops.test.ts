import type { Caption } from '../src/captions-types'
import { createTikTokStyleCaptions } from '@remotion/captions'
import { describe, expect, it } from 'vitest'
import { mergeCaptionPunctuation } from '../src/captions-ops'

function cap(text: string, startMs: number, endMs: number): Caption {
  return {
    text,
    startMs,
    endMs,
    timestampMs: startMs,
    confidence: null,
  }
}

describe('mergeCaptionPunctuation', () => {
  it('并进前一条并抹掉标点自身的前导空格（whisper 直出的 token 带空格）', () => {
    const out = mergeCaptionPunctuation([cap('gatherings', 9670, 10560), cap(' .', 10560, 10800)])
    expect(out).toEqual([cap('gatherings.', 9670, 10800)])
  })

  it('同一处重复吐的标点只留第一个', () => {
    const out = mergeCaptionPunctuation([
      cap('gatherings', 0, 100),
      cap(' .', 100, 100),
      cap(' ,', 100, 100),
      cap(' .', 100, 100),
      cap(' ,', 100, 100),
      cap(' From', 100, 300),
    ])
    // 重复的标点被丢掉，只留第一个 —— 这正是截图里「.,.,」的来源
    expect(out.map(c => c.text)).toEqual(['gatherings.', ' From'])
  })

  it('不带空格的标点（导入的 SRT）同样合并', () => {
    const out = mergeCaptionPunctuation([cap('you', 0, 1000), cap('.', 1000, 1000)])
    expect(out.map(c => c.text)).toEqual(['you.'])
  })

  it('词尾自带标点的条目不动（不是「整条只有标点」）', () => {
    const list = [cap('home,', 0, 500), cap(' you', 500, 900)]
    expect(mergeCaptionPunctuation(list)).toBe(list) // 无变化 ⇒ 原引用
  })

  it('首条就是标点时无处可并，原样留着而不是崩', () => {
    const out = mergeCaptionPunctuation([cap('.', 0, 100), cap(' Hi', 100, 300)])
    expect(out.map(c => c.text)).toEqual(['.', ' Hi'])
  })

  it('幂等：跑过一遍再跑不变，且返回原引用', () => {
    const once = mergeCaptionPunctuation([cap('you', 0, 1000), cap('.', 1000, 1000)])
    expect(mergeCaptionPunctuation(once)).toBe(once)
  })

  it('空数组返回原引用', () => {
    const empty: Caption[] = []
    expect(mergeCaptionPunctuation(empty)).toBe(empty)
  })

  // 这才是这个函数存在的理由：不合并时分页会切出「.,.,From here」这种页首
  it('修掉分页后页首的标点垃圾', () => {
    const raw = [
      cap('gatherings', 9670, 10560),
      cap(' .', 10560, 10560),
      cap(' ,', 10560, 10560),
      cap(' From', 10560, 10890),
      cap(' here', 10890, 11200),
    ]
    // 不断言分页边界（那是 @remotion/captions 按时长决定的），只看标点贴不贴着词
    const before = createTikTokStyleCaptions({ captions: raw, combineTokensWithinMilliseconds: 1200 })
    expect(before.pages[0].text).toContain('gatherings . ,')

    const after = createTikTokStyleCaptions({
      captions: mergeCaptionPunctuation(raw),
      combineTokensWithinMilliseconds: 1200,
    })
    expect(after.pages[0].text).toContain('gatherings.')
    expect(after.pages.every(p => !/^[.,!?;:]/.test(p.text))).toBe(true)
  })

  it('一条里自带的省略号 / 叹问号不动 —— 它们不是独立成条的重复', () => {
    const list = [cap('wait', 0, 500), cap(' …', 500, 600), cap(' really', 600, 900)]
    expect(mergeCaptionPunctuation(list).map(c => c.text)).toEqual(['wait…', ' really'])
    const bang = [cap('what', 0, 500), cap('?!', 500, 600)]
    expect(mergeCaptionPunctuation(bang).map(c => c.text)).toEqual(['what?!'])
  })
})
