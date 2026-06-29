import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { createPublicRouter } from './public';

type PublicRouterDeps = NonNullable<Parameters<typeof createPublicRouter>[0]>;

function createDemoPublication(runId = 'cmqj7n97d003vmw10si9skovh') {
  return {
    id: 'global-public-demo',
    status: 'published',
    activeClassificationRunId: runId,
    publishedAt: new Date('2026-06-20T08:15:00.000Z'),
    publicTitle: 'Public accelerator classification workup',
    publicSummary:
      'A human-reviewed technical classification workup generated from a publicly available product datasheet.',
    sourceDocumentDisplayName: 'public-edge-accelerator.pdf',
    activeClassificationRun: {
      id: runId,
      status: 'completed',
      confidence: 0.64,
      uncertaintyFlags: ['multiple_plausible_eccns'],
      requiresHumanReview: true,
      createdAt: new Date('2026-06-20T08:00:00.000Z'),
      completedAt: new Date('2026-06-20T08:05:00.000Z'),
      extractedTextPath: '/private/extracted.txt',
      structuredOutputPath: '/private/output.json',
      memoArtifactPath: '/private/memo.md',
      document: {
        id: 'doc_private',
        organizationId: 'org_private',
        title: 'Public edge accelerator datasheet',
        fileName: 'private-source-name.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 128000,
        storagePath: 'private/storage/path.pdf',
        sourceType: 'seed',
        rawText:
          'A public hardware datasheet describing process node, interface, and cryptography details.',
      },
      extractedSpecs: [
        {
          id: 'spec_1',
          name: 'process_node',
          value: '7',
          unit: 'nm',
          sourceSnippet: 'Manufactured on a 7 nm process node.',
          importance: 'process threshold review',
          category: 'semiconductor_process',
          confidenceLevel: 'medium',
        },
      ],
      eccnCandidates: [
        {
          id: 'cand_1',
          eccn: '3A001',
          title: 'Specified electronic items and components',
          confidenceLevel: 'medium',
          matchedTechnicalFacts: ['process_node: 7 nm'],
          whyItMayApply: 'The semiconductor performance facts support a Category 3 review.',
          whyItMayNotApply: 'The exact control threshold still needs reviewer mapping.',
          missingInformation: ['Precise threshold mapping'],
          uncertaintyFlags: ['multiple_plausible_eccns'],
          reviewerQuestions: ['Which exact control-text threshold is the closest fit?'],
          citations: [
            {
              id: 'cit_1',
              sourceTitle: 'CCL Category 3',
              quotedText: 'Category 3 contains electronics review paths.',
              sourceSection: '15 CFR Supplement No. 1 to Part 774, Category 3',
              sourceUrl: null,
              relevanceNote: 'Supports a Category 3 review path.',
            },
          ],
        },
      ],
      reviewMemo: {
        id: 'memo_1',
        contentMarkdown: '# Draft memo\n\nPublic demo memo content.',
        updatedAt: new Date('2026-06-20T08:05:00.000Z'),
        generatedBy: 'private-generator',
      },
      humanReviews: [
        {
          id: 'review_1',
          status: 'reviewed',
          notes: 'Engineering thresholds should be confirmed before internal adoption.',
          reviewedAt: new Date('2026-06-20T08:10:00.000Z'),
          reviewer: {
            id: 'user_private',
            name: 'Private Reviewer',
            email: 'private@example.com',
          },
        },
      ],
    },
  };
}

type MockResponse = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  set: (headers: Record<string, string>) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
  send: (payload: unknown) => MockResponse;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(headers) {
      this.headers = { ...this.headers, ...headers };
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function invokePublicRoute(options: {
  path: '/classification-runs/:runId' | '/classification-runs/:runId/memo/download' | '/demo';
  runId?: string;
  loadPublicDemoRun?: PublicRouterDeps['loadPublicDemoRun'];
  loadActivePublicDemo?: PublicRouterDeps['loadActivePublicDemo'];
  rateLimit?: PublicRouterDeps['rateLimit'];
}) {
  const router = createPublicRouter({
    loadPublicDemoRun: options.loadPublicDemoRun,
    loadActivePublicDemo: options.loadActivePublicDemo,
    rateLimit: options.rateLimit,
  });
  const layer = router.stack.find(
    (entry) =>
      entry.route?.path === options.path &&
      Boolean((entry.route as { methods?: Record<string, boolean> }).methods?.get),
  );
  const handler = layer?.route?.stack?.[0]?.handle;

  if (!handler) {
    throw new Error('Could not find public handler.');
  }

  const req = {
    params: { runId: options.runId ?? '' },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = createMockResponse();

  await handler(req as never, res as never, () => undefined);
  return res;
}

test('anonymous users can view only the active published demo run', async () => {
  const allowed = await invokePublicRoute({
    path: '/classification-runs/:runId',
    runId: 'cmqj7n97d003vmw10si9skovh',
    loadPublicDemoRun: async (runId: string) =>
      runId === 'cmqj7n97d003vmw10si9skovh'
        ? (createDemoPublication(runId) as never)
        : null,
    rateLimit: () => undefined,
  });
  assert.equal(allowed.statusCode, 200);

  const blocked = await invokePublicRoute({
    path: '/classification-runs/:runId',
    runId: 'private-run-id',
    loadPublicDemoRun: async () => null,
    rateLimit: () => undefined,
  });
  assert.equal(blocked.statusCode, 404);
});

test('public endpoint returns sanitized payload without sensitive fields', async () => {
  const response = await invokePublicRoute({
    path: '/classification-runs/:runId',
    runId: 'cmqj7n97d003vmw10si9skovh',
    loadPublicDemoRun: async () => createDemoPublication() as never,
    rateLimit: () => undefined,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=300');
  const payload = response.body as Record<string, unknown> & {
    publicTitle: string;
    sourceDocumentDisplayName?: string;
    document: Record<string, unknown>;
    reviewMemo: Record<string, unknown>;
    latestReview?: Record<string, unknown> | null;
  };
  const payloadText = JSON.stringify(payload);

  assert.equal(payload.publicTitle, 'Public accelerator classification workup');
  assert.equal(payload.sourceDocumentDisplayName, 'public-edge-accelerator.pdf');
  assert.equal(payload.document.fileName, undefined);
  assert.equal(payload.document.id, undefined);
  assert.equal(payload.reviewMemo.generatedBy, undefined);
  assert.equal(payload.latestReview?.reviewer, undefined);
  assert.doesNotMatch(payloadText, /org_private/);
  assert.doesNotMatch(payloadText, /private@example\.com/);
  assert.doesNotMatch(payloadText, /\/private\/memo\.md/);
});

test('public memo download endpoint returns markdown attachment for the active demo run', async () => {
  const response = await invokePublicRoute({
    path: '/classification-runs/:runId/memo/download',
    runId: 'cmqj7n97d003vmw10si9skovh',
    loadPublicDemoRun: async () => createDemoPublication() as never,
    rateLimit: () => undefined,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'text/markdown; charset=utf-8');
  assert.match(
    response.headers['Content-Disposition'] ?? '',
    /attachment; filename="substrata-eccn-review-public-edge-accelerator\.md"/,
  );
  assert.equal(response.body, '# Draft memo\n\nPublic demo memo content.');
});

test('public demo metadata endpoint returns the canonical public URL', async () => {
  const response = await invokePublicRoute({
    path: '/demo',
    loadActivePublicDemo: async () => createDemoPublication() as never,
    rateLimit: () => undefined,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    runId: 'cmqj7n97d003vmw10si9skovh',
    status: 'published',
    publishedAt: new Date('2026-06-20T08:15:00.000Z'),
    publicTitle: 'Public accelerator classification workup',
    publicSummary:
      'A human-reviewed technical classification workup generated from a publicly available product datasheet.',
    sourceDocumentDisplayName: 'public-edge-accelerator.pdf',
    completedAt: new Date('2026-06-20T08:05:00.000Z'),
    canonicalUrl: '/classification-runs/cmqj7n97d003vmw10si9skovh',
  });
});

test('authenticated classification-run routes still require normal auth', async () => {
  const req = {};
  let forwardedError: unknown;
  const next: NextFunction = (error?: unknown) => {
    forwardedError = error;
  };

  requireAuth(req as never, {} as never, next);

  assert.equal((forwardedError as { statusCode?: number })?.statusCode, 401);
});
