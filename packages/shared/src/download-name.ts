/**
 * 渲染产物下载文件名的服务端工具。
 *
 * 命名**策略**（叫什么名字）由消费方前端组装并经 EditorDeps.exportFileName 注入，库不含策略；
 * 服务端只负责把它挂到产物上，且**必须先清洗**（sanitizeFileName）：文件名是客户端可控
 * 的、要写进响应头的输入，「前端提供」不等于「服务端信任」。
 *
 * 为什么不能用 `<a download="...">`：产物 URL 跨源，该属性的文件名会被浏览器忽略。
 * 唯一可靠途径是 `Content-Disposition: attachment; filename=...`
 * （S3 侧写进对象元数据；本地 FS 侧由静态路由发头）。
 */

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
