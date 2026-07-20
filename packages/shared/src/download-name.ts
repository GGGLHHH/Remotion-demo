/**
 * 渲染产物的下载文件名。
 *
 * 名字由**前端**组装（buildDownloadName）：只有前端知道项目名与导出时刻，且命名策略
 * 收敛在一处——否则要在两个渲染服务里各维护一份。
 *
 * 服务端只负责把它挂到产物上，且**必须先清洗**（sanitizeFileName）：文件名是客户端可控
 * 的、要写进响应头的输入，「前端提供」不等于「服务端信任」。
 *
 * 为什么不能用 `<a download="...">`：产物 URL 跨源，该属性的文件名会被浏览器忽略。
 * 唯一可靠途径是 `Content-Disposition: attachment; filename=...`
 * （S3 侧写进对象元数据；本地 FS 侧由静态路由发头）。
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 本地时区的 YYYY-MM-DD HH:mm:ss */
export const formatStamp = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

/** 去掉文件系统非法字符并压缩空白；保留中文与连字符。限长防超头。
 *  用于名字的「基础名」部分（项目地址等），故连冒号一起去掉——时间戳的冒号是后拼的。 */
export const sanitizeBaseName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/** 前端组装：`${baseName} ${YYYY-MM-DD HH:mm:ss}.${codec}`；无 baseName 则只有时间戳。 */
export const buildDownloadName = (
  codec: string,
  baseName: string | undefined,
  now: Date,
): string => {
  const cleaned = baseName ? sanitizeBaseName(baseName) : '';
  return `${cleaned ? `${cleaned} ` : ''}${formatStamp(now)}.${codec}`;
};

/**
 * 服务端对客户端传入文件名的防御性清洗。只去路径分隔符并限长：
 * - 冒号要保留（时间戳里有）
 * - 控制字符无需处理——contentDisposition 的 ASCII 回退把非可打印字符换成 `_`，
 *   filename* 走百分号编码，故不可能折行注入响应头
 * 返回空串表示客户端没给出可用名字，调用方应回退到自己的默认名。
 */
export const sanitizeFileName = (name: string): string =>
  name.replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);

/** RFC 5987/6266：ASCII 回退名给老客户端，filename* 携带 UTF-8 原名（中文地址） */
export const contentDisposition = (filename: string): string => {
  const ascii = filename.replace(/[^ -~]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};
