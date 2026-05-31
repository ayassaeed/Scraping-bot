import { Router } from 'express';
import { JobStore } from '../services/jobStore.js';

export const jobRouter = Router();

jobRouter.get('/', async (_req, res) => {
  res.json(await JobStore.list());
});

jobRouter.get('/:jobId', async (req, res) => {
  const job = await JobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

jobRouter.delete('/:jobId', async (req, res) => {
  const deleted = await JobStore.delete(req.params.jobId);
  if (!deleted) return res.status(404).json({ error: 'Job not found' });
  res.json({ deleted: true });
});
