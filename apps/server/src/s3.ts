import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';

export const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: true, // MinIO 必需
});

/** 建桶 + 匿名只读策略（开发期；生产由运维配置桶策略） */
export const ensureBucket = async (): Promise<void> => {
  const { bucket } = config.s3;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      }),
    }),
  );
};

export const deleteObject = async (key: string): Promise<void> => {
  await s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
};

export const createUploadUrl = async (
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> => {
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, ContentType: contentType }),
    { expiresIn: 3600 },
  );
  return {
    uploadUrl,
    publicUrl: `${config.s3.publicBaseUrl}/${config.s3.bucket}/${key}`,
  };
};
