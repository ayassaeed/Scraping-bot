import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// ── Redis connection ───────────────────────────────────────────────
// Falls back to in-memory Map if REDIS_URL is not set (local dev)
let redis = null;
const memStore = new Map();

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  });

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err) => logger.error({ err: err.message }, 'Redis error'));
} else {
  logger.warn('REDIS_URL not set — using in-memory store (data lost on restart)');
}

const JOB_TTL = 3600; // 1 hour in seconds

// ── Store API ──────────────────────────────────────────────────────
export const JobStore = {
  async create(jobId, input) {
    const job = {
      jobId,
      status: 'queued',
      input,
      logs: [],
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await _set(jobId, job);
    return job;
  },

  async get(jobId) {
    return _get(jobId);
  },

  async list() {
    if (redis) {
      const keys = await redis.keys('job:*');
      if (!keys.length) return [];
      const values = await redis.mget(keys);
      return values
        .filter(Boolean)
        .map(v => {
          const j = JSON.parse(v);
          return { jobId: j.jobId, status: j.status, url: j.input?.url, createdAt: j.createdAt, updatedAt: j.updatedAt };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50);
    }
    return [...memStore.values()]
      .map(j => ({ jobId: j.jobId, status: j.status, url: j.input?.url, createdAt: j.createdAt, updatedAt: j.updatedAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
  },

  async update(jobId, patch) {
    const job = await _get(jobId);
    if (!job) return;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    await _set(jobId, job);
  },

  async log(jobId, message, level = 'info') {
    const job = await _get(jobId);
    if (!job) return;
    job.logs.push({ ts: new Date().toISOString(), level, message });
    job.updatedAt = new Date().toISOString();
    await _set(jobId, job);
  },

  async complete(jobId, result) {
    await JobStore.update(jobId, { status: 'done', result });
  },

  async fail(jobId, error) {
    await JobStore.update(jobId, { status: 'failed', error });
  },

  async delete(jobId) {
    if (redis) {
      const deleted = await redis.del(`job:${jobId}`);
      return deleted > 0;
    }
    return memStore.delete(jobId);
  },
};

async function _get(jobId) {
  if (redis) {
    const raw = await redis.get(`job:${jobId}`);
    return raw ? JSON.parse(raw) : null;
  }
  return memStore.get(jobId) ?? null;
}

async function _set(jobId, job) {
  if (redis) {
    await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', JOB_TTL);
  } else {
    memStore.set(jobId, job);
    // Cleanup for in-memory store
    setTimeout(() => memStore.delete(jobId), JOB_TTL * 1000);
  }
}
