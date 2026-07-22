import { describe, expect, it } from 'vitest';
import { contentDisposition, sanitizeFileName } from '../download-name';

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
