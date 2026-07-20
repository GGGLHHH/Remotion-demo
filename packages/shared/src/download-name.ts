/**
 * 渲染产物的下载文件名。
 *
 * 为什么必须服务端定名：产物 URL 是 S3/MinIO 的**跨源**绝对地址，而 HTML `<a download="...">`
 * 的文件名对跨源 URL 会被浏览器忽略。所以唯一可靠的途径是让对象自带
 * `Content-Disposition: attachment; filename=...`（PutObject 时写入）。
 *
 * baseName（如项目地址）由消费方经 editor 注入 → /api/render 传入；时间戳取渲染完成时刻。
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 本地时区的 YYYY-MM-DD HH:mm:ss */
export const formatStamp = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

/** 去掉文件系统非法字符并压缩空白；保留中文与连字符。限长防超头。
 *  控制字符不用管：ASCII 回退名会换成 _，filename* 走 encodeURIComponent 百分号编码。 */
export const sanitizeBaseName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/** 下载名 = `${baseName} ${YYYY-MM-DD HH:mm:ss}.${codec}`；无 baseName 则只有时间戳。 */
export const buildDownloadName = (
  codec: string,
  baseName: string | undefined,
  now: Date,
): string => {
  const cleaned = baseName ? sanitizeBaseName(baseName) : '';
  return `${cleaned ? `${cleaned} ` : ''}${formatStamp(now)}.${codec}`;
};

/** RFC 5987/6266：ASCII 回退名给老客户端，filename* 携带 UTF-8 原名（中文地址） */
export const contentDisposition = (filename: string): string => {
  const ascii = filename.replace(/[^ -~]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};
