/** 开发默认值对齐 docker-compose.yml；生产用环境变量覆盖 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9100',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    bucket: process.env.S3_BUCKET ?? 'editor-assets',
    /** 浏览器访问 MinIO 的地址（生产为 CDN/OSS 域名） */
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? 'http://localhost:9100',
  },
};
