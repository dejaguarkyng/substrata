import { Router, type Request } from 'express';
import { HttpError } from '../lib/errors';
import {
  presentPublicDemoMetadata,
  presentPublicDemoRun,
} from '../services/presenters';
import { assertRateLimit } from '../services/rate-limit.service';
import {
  getActivePublicDemo,
  getPublicDemoClassificationRun,
} from '../services/classification.service';

type PublicRouterDeps = {
  loadPublicDemoRun?: (runId: string) => ReturnType<typeof getPublicDemoClassificationRun>;
  loadActivePublicDemo?: () => ReturnType<typeof getActivePublicDemo>;
  rateLimit?: typeof assertRateLimit;
};

function getClientIp(req: Request) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown'
  );
}

export function createPublicRouter(deps: PublicRouterDeps = {}) {
  const router = Router();
  const loadPublicDemoRun = deps.loadPublicDemoRun ?? getPublicDemoClassificationRun;
  const loadActivePublicDemo = deps.loadActivePublicDemo ?? getActivePublicDemo;
  const rateLimit = deps.rateLimit ?? assertRateLimit;

  function setPublicCacheHeaders() {
    return {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      Vary: 'Accept-Encoding',
    };
  }

  router.get('/demo', async (req, res) => {
    try {
      rateLimit({
        key: `public-demo-meta:${getClientIp(req)}`,
        limit: 60,
        windowMs: 60 * 1000,
      });
    } catch (error) {
      throw new HttpError(
        429,
        error instanceof Error ? error.message : 'Too many requests. Try again later.',
      );
    }

    const publication = await loadActivePublicDemo();

    if (!publication) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Public classification demo not found.',
      });
    }

    res.set(setPublicCacheHeaders());
    return res.json(presentPublicDemoMetadata(publication));
  });

  router.get('/classification-runs/:runId', async (req, res) => {
    try {
      rateLimit({
        key: `public-demo:${getClientIp(req)}:${String(req.params.runId)}`,
        limit: 60,
        windowMs: 60 * 1000,
      });
    } catch (error) {
      throw new HttpError(
        429,
        error instanceof Error ? error.message : 'Too many requests. Try again later.',
      );
    }

    const run = await loadPublicDemoRun(String(req.params.runId));

    if (!run) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Public classification demo not found.',
      });
    }

    res.set(setPublicCacheHeaders());
    return res.json(presentPublicDemoRun(run));
  });

  router.get('/classification-runs/:runId/memo/download', async (req, res) => {
    try {
      rateLimit({
        key: `public-demo-memo:${getClientIp(req)}:${String(req.params.runId)}`,
        limit: 60,
        windowMs: 60 * 1000,
      });
    } catch (error) {
      throw new HttpError(
        429,
        error instanceof Error ? error.message : 'Too many requests. Try again later.',
      );
    }

    const publication = await loadPublicDemoRun(String(req.params.runId));

    if (!publication?.activeClassificationRun?.reviewMemo?.contentMarkdown) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Public classification memo not found.',
      });
    }

    const run = publication.activeClassificationRun;
    const baseName = (publication.sourceDocumentDisplayName ?? run.document.title)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    const safeTitle = baseName || run.id;

    res.set(setPublicCacheHeaders());
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="substrata-eccn-review-${safeTitle}.md"`,
    );

    return res.send(run.reviewMemo.contentMarkdown);
  });

  return router;
}

export const publicRouter = createPublicRouter();
