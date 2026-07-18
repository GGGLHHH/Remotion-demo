import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { createUploadUrl, deleteObject, ensureBucket } from './s3';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get('/healthz', async () => ({ ok: true }));

app.post<{ Body: { filename: string; contentType: string } }>('/api/upload', async (req, reply) => {
  const { filename, contentType } = req.body ?? {};
  if (!filename || !contentType) {
    return reply.code(400).send({ error: 'filename and contentType required' });
  }
  // key 去除路径穿越，保留扩展名
  const safe = filename.replace(/[^\w.\-一-龥]/g, '_').slice(-80);
  const key = `assets/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { uploadUrl, publicUrl } = await createUploadUrl(key, contentType);
  return { uploadUrl, publicUrl, key };
});

app.post<{ Body: { key: string } }>('/api/delete-asset', async (req, reply) => {
  const { key } = req.body ?? {};
  // 仅允许删上传前缀下的对象，防误删桶内其他内容
  if (!key || !key.startsWith('assets/') || key.includes('..')) {
    return reply.code(400).send({ error: 'invalid key' });
  }
  await deleteObject(key);
  return { ok: true };
});

await ensureBucket();
await app.listen({ port: config.port, host: '0.0.0.0' });
