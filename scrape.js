import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { JobStore } from '../services/jobStore.js';
import { runScrapeJob } from '../services/scraper.js';
import { logger } from '../utils/logger.js';

export const scrapeRouter = Router();

const ScrapeSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  goal: z.string().min(5).max(500),
  format: z.enum(['json', 'csv', 'markdown', 'text']).default('json'),
  mode: z.enum(['ai', 'selectors', 'xpath']).default('ai'),
  selectors: z.record(z.string()).optional(),
  options: z.object({
    waitForSelector: z.string().optional(),
    timeout: z.number().min(1000).max(30000).default(15000),
    javascript: z.boolean().default(true),
    maxItems: z.number().min(1).max(200).default(50),
    pagination: z.boolean().default(false),
    paginationSelector: z.string().optional(),
    maxPages: z.number().min(1).max(10).default(3),
  }).optional().default({}),
});

// POST /api/scrape — async, returns jobId
scrapeRouter.post('/', async (req, res, next) => {
  try {
    const parsed = ScrapeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }
    const jobId = uuid();
    const job = await JobStore.create(jobId, parsed.data);
    logger.info({ jobId, url: parsed.data.url, apiKey: req.apiKey }, 'Scrape job queued');

    runScrapeJob(job).catch(err => {
      logger.error({ jobId, err: err.message }, 'Job failed');
      JobStore.fail(jobId, err.message);
    });

    res.status(202).json({ jobId, status: 'queued', pollUrl: `/api/jobs/${jobId}` });
  } catch (err) { next(err); }
});

// POST /api/scrape/sync — waits for result
scrapeRouter.post('/sync', async (req, res, next) => {
  try {
    const parsed = ScrapeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }
    const jobId = uuid();
    const job = await JobStore.create(jobId, parsed.data);
    logger.info({ jobId, url: parsed.data.url, apiKey: req.apiKey }, 'Sync scrape job started');

    await runScrapeJob(job);
    const result = await JobStore.get(jobId);

    if (result.status === 'failed') return res.status(422).json({ error: result.error, jobId });
    res.json(result);
  } catch (err) { next(err); }
});
