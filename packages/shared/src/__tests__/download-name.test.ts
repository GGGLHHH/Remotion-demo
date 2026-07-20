import { describe, expect, it } from 'vitest';
import {
  buildDownloadName,
  contentDisposition,
  sanitizeBaseName,
  sanitizeFileName,
} from '../download-name';

// 固定时刻，避开 Date.now() 让断言可重复（本地时区）
const AT = new Date(2026, 6, 20, 19, 30, 5); // 2026-07-20 19:30:05

describe('buildDownloadName', () => {
  it('拼成 `地址 + 时间.扩展名`，时间为 YYYY-MM-DD HH:mm:ss（补零）', () => {
    expect(buildDownloadName('mp4', '1 Reject St', AT)).toBe('1 Reject St 2026-07-20 19:30:05.mp4');
  });

  it('无 baseName 时只留时间戳', () => {
    expect(buildDownloadName('webm', undefined, AT)).toBe('2026-07-20 19:30:05.webm');
  });

  it('baseName 清洗后为空也不留下多余空格', () => {
    expect(buildDownloadName('mp4', '///', AT)).toBe('2026-07-20 19:30:05.mp4');
  });
});

describe('sanitizeBaseName', () => {
  it('剥掉文件系统非法字符,但保留中文与连字符', () => {
    expect(sanitizeBaseName('武汉/光谷:大厦*A-1')).toBe('武汉 光谷 大厦 A-1');
  });

  it('压缩空白并去首尾', () => {
    expect(sanitizeBaseName('  a   b  ')).toBe('a b');
  });

  it('限长 120 防超头', () => {
    expect(sanitizeBaseName('x'.repeat(200))).toHaveLength(120);
  });
});

// 文件名现在由前端提供 → 服务端把它当不可信输入清洗
describe('sanitizeFileName', () => {
  it('保留时间戳里的冒号(与 sanitizeBaseName 不同)', () => {
    expect(sanitizeFileName('1 Reject St 2026-07-20 19:30:05.mp4')).toBe(
      '1 Reject St 2026-07-20 19:30:05.mp4',
    );
  });

  it('去掉路径分隔符,挡住路径形态的名字', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('.. .. etc passwd');
    expect(sanitizeFileName('a\\b.mp4')).toBe('a b.mp4');
  });

  it('全是分隔符 → 空串,调用方据此回退默认名', () => {
    expect(sanitizeFileName('///')).toBe('');
  });

  it('限长 150', () => {
    expect(sanitizeFileName('x'.repeat(300))).toHaveLength(150);
  });

  it('CRLF 无法折行注入响应头', () => {
    const header = contentDisposition(sanitizeFileName('a\r\nX-Evil: 1.mp4'));
    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
  });
});

describe('contentDisposition', () => {
  it('ASCII 名进 filename,原名进 filename*(RFC 5987)', () => {
    const header = contentDisposition('1 Reject St 2026-07-20 19:30:05.mp4');
    expect(header).toBe(
      `attachment; filename="1 Reject St 2026-07-20 19:30:05.mp4"; ` +
        `filename*=UTF-8''${encodeURIComponent('1 Reject St 2026-07-20 19:30:05.mp4')}`,
    );
  });

  it('中文名的 ASCII 回退用 _,filename* 保留原名', () => {
    const header = contentDisposition('武汉大厦.mp4');
    expect(header).toContain('filename="____.mp4"'); // 4 个汉字 → 4 个 _
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('武汉大厦.mp4')}`);
  });

  it('原名里的双引号不会截断 quoted-string', () => {
    expect(contentDisposition('a"b.mp4')).toContain(`filename="a'b.mp4"`);
  });
});
