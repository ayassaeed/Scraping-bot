import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { JobStore } from './jobStore.js';
import { askAI } from './ai.js';
import { formatOutput } from '../utils/formatter.js';
import { logger } from '../utils/logger.js';

export async function runScrapeJob(job) {
  const { jobId, input } = job;
  const { url, goal, format, mode, selectors, options = {} } = input;
  const { timeout = 15000, javascript = true, maxItems = 50,
          pagination = false, paginationSelector, maxPages = 3, waitForSelector } = options;

  await JobStore.update(jobId, { status: 'running' });
  await JobStore.log(jobId, `Starting scrape: ${url}`);

  try {
    let pages = [];
    if (javascript) {
      pages = await fetchWithPlaywright({ url, timeout, waitForSelector, pagination, paginationSelector, maxPages, jobId });
    } else {
      await JobStore.log(jobId, 'Fetching page (no-JS mode)...');
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScrapingBot/2.0)' },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      pages = [await res.text()];
    }

    await JobStore.log(jobId, `Fetched ${pages.length} page(s)`);
    let allItems = [];

    for (const [i, html] of pages.entries()) {
      await JobStore.log(jobId, `Extracting page ${i + 1}/${pages.length}...`);
      let items;
      if (mode === 'ai') items = await extractWithAI(html, goal, url, jobId);
      else if (mode === 'selectors') items = extractWithSelectors(html, selectors ?? {});
      else if (mode === 'xpath') items = extractWithXPath(html, selectors ?? {});
      allItems.push(...items);
      if (allItems.length >= maxItems) break;
    }

    allItems = allItems.slice(0, maxItems);
    await JobStore.log(jobId, `Extracted ${allItems.length} item(s)`);

    const formatted = await formatOutput(allItems, format);
    const result = { url, goal, format, mode, itemCount: allItems.length, items: allItems, output: formatted, scrapedAt: new Date().toISOString() };

    await JobStore.complete(jobId, result);
    logger.info({ jobId, itemCount: allItems.length }, 'Scrape job complete');
  } catch (err) {
    await JobStore.log(jobId, `Error: ${err.message}`, 'error');
    await JobStore.fail(jobId, err.message);
    throw err;
  }
}

async function fetchWithPlaywright({ url, timeout, waitForSelector, pagination, paginationSelector, maxPages, jobId }) {
  await JobStore.log(jobId, 'Launching headless browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const htmlPages = [];
  try {
    const page = await context.newPage();
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,ico}', r => r.abort());
    await page.route('**/analytics*', r => r.abort());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {});
    htmlPages.push(await page.content());
    await JobStore.log(jobId, 'Page loaded');

    if (pagination && paginationSelector) {
      for (let p = 2; p <= maxPages; p++) {
        const nextBtn = await page.$(paginationSelector);
        if (!nextBtn) break;
        await JobStore.log(jobId, `Navigating to page ${p}...`);
        await nextBtn.click();
        await page.waitForLoadState('domcontentloaded');
        htmlPages.push(await page.content());
      }
    }
  } finally {
    await browser.close();
  }
  return htmlPages;
}

async function extractWithAI(html, goal, url, jobId) {
  await JobStore.log(jobId, 'Sending to Claude AI for extraction...');
  const truncated = trimHtml(html, 12000);
  const prompt = `You are a web scraping expert. Extract structured data from this HTML.

URL: ${url}
Goal: ${goal}

HTML (may be truncated):
\`\`\`html
${truncated}
\`\`\`

Return a JSON array of objects with consistent snake_case keys. Clean and normalize all values.
Return ONLY the JSON array, no explanation, no markdown fences.`;

  const text = await askAI(prompt);
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    await JobStore.log(jobId, 'AI returned non-JSON — wrapping as text', 'warn');
    return [{ extracted_text: text }];
  }
}

function extractWithSelectors(html, selectors) {
  const $ = cheerio.load(html);
  const keys = Object.keys(selectors);
  if (!keys.length) return [];
  const items = [];
  $(selectors[keys[0]]).each((i) => {
    const item = {};
    for (const [field, sel] of Object.entries(selectors)) {
      item[field] = $(sel).eq(i).text().trim() || null;
    }
    items.push(item);
  });
  return items;
}

function extractWithXPath(html, xpathMap) {
  const $ = cheerio.load(html);
  const item = {};
  for (const [field, expr] of Object.entries(xpathMap)) {
    const css = expr.replace(/^\/\//, '').replace(/\[@([a-z-]+)=['"]([^'"]+)['"]\]/g, '[$1="$2"]').replace(/\//g, ' > ');
    item[field] = $(css).first().text().trim() || null;
  }
  return [item];
}

function trimHtml(html, maxChars) {
  if (html.length <= maxChars) return html;
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').slice(0, maxChars);
}
