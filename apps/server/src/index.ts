import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { UndoableState } from '@gedatou/shared';
import { config } from './config';
import { createUploadUrl, deleteObject, ensureBucket } from './s3';
import { enqueueRender, tasks } from './renderer';
import { transcribeAudio } from './whisper';

// bodyLimit: 渲染请求携带完整工程 state（含字幕数组），默认 1MiB 不够
const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });

await app.register(cors, { origin: true });
// 10 分钟 16kHz 单声道 PCM16 约 19MB，上限给足余量
await app.register(multipart, { limits: { fileSize: 64 * 1024 * 1024 } });

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

app.post<{ Body: { state: UndoableState; codec: 'mp4' | 'webm'; baseName?: string } }>(
  '/api/render',
  async (req, reply) => {
    const { state, codec, baseName } = req.body ?? {};
    if (!state || (codec !== 'mp4' && codec !== 'webm')) {
      return reply.code(400).send({ error: 'state and codec (mp4|webm) required' });
    }
    return { taskId: enqueueRender(state, codec, baseName) };
  },
);

// 接收 16kHz 单声道 WAV（客户端已转好）→ whisper.cpp 转录。
// 首次调用会编译 whisper.cpp + 下载模型，可能耗时数分钟（Fastify 默认无请求超时）。
app.post('/api/captions', async (req, reply) => {
  const file = await req.file();
  if (!file) return reply.code(400).send({ error: 'audio file required' });
  const tmpPath = path.join(os.tmpdir(), `captions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`);
  try {
    await pipeline(file.file, createWriteStream(tmpPath));
    return { captions: await transcribeAudio(tmpPath) };
  } finally {
    await rm(tmpPath, { force: true });
  }
});

app.post<{ Body: { taskId: string } }>('/api/progress', async (req, reply) => {
  const task = tasks.get(req.body?.taskId ?? '');
  if (!task) return reply.code(404).send({ error: 'unknown taskId' });
  return task;
});

await ensureBucket();
await app.listen({ port: config.port, host: '0.0.0.0' });
