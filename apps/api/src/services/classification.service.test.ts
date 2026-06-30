import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@substrata/db';
import { getClassificationRunDemoPublicationStatus } from './classification.service';

test('demo publication status allows completed upload-backed runs with memo drafts', async () => {
  const originalFindFirst = prisma.classificationRun.findFirst;
  const originalFindUnique = prisma.publicDemoPublication.findUnique;

  try {
    prisma.classificationRun.findFirst = (async () =>
      ({
        id: 'run_upload_demo',
        organizationId: 'org_1',
        documentId: 'doc_1',
        status: 'completed',
        workflowState: 'awaiting_reviewer_assignment',
        trigger: 'manual',
        confidence: 0.64,
        confidenceRationale: 'Evidence package complete.',
        uncertaintyFlags: [],
        requiresHumanReview: true,
        reviewerAssignedUserId: null,
        reviewerClaimedAt: null,
        finalInternalRecommendation: null,
        conclusionDisclaimer: null,
        lastReviewerActionAt: null,
        workerJobId: null,
        workerVersion: null,
        rulesVersion: null,
        extractedTextPath: null,
        structuredOutputPath: null,
        memoArtifactPath: null,
        capabilitySignals: null,
        validationIssues: null,
        errorMessage: null,
        completedAt: new Date('2026-06-30T12:00:00.000Z'),
        createdAt: new Date('2026-06-30T11:55:00.000Z'),
        updatedAt: new Date('2026-06-30T12:00:00.000Z'),
        document: {
          id: 'doc_1',
          organizationId: 'org_1',
          title: 'Shared technical datasheet',
          fileName: 'shared-technical-datasheet.pdf',
          displayFileName: 'shared-technical-datasheet.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 123456,
          storagePath: 'private/shared-technical-datasheet.pdf',
          sourceType: 'upload',
          documentType: 'Datasheet',
          manufacturer: 'Example Semi',
          sourceUrl: null,
          sourceDate: null,
          versionLabel: 'Rev A',
          sha256: null,
          pageCount: 12,
          extractionStatus: 'completed',
          origin: 'customer_provided',
          visibility: 'private',
          rawText: 'Source-backed technical text.',
          createdAt: new Date('2026-06-30T11:50:00.000Z'),
          updatedAt: new Date('2026-06-30T11:50:00.000Z'),
        },
        extractedSpecs: [],
        factIssues: [],
        reviewPaths: [],
        eccnCandidates: [],
        reviewMemo: {
          id: 'memo_1',
          organizationId: 'org_1',
          classificationRunId: 'run_upload_demo',
          contentMarkdown: '# Draft ECCN Review Memo',
          disclaimer: 'Draft review memo.',
          generatedBy: 'worker',
          versionNumber: 1,
          reviewStateSnapshot: 'draft_generated',
          reviewerStatusSnapshot: 'pending_review',
          createdAt: new Date('2026-06-30T12:00:00.000Z'),
          updatedAt: new Date('2026-06-30T12:00:00.000Z'),
        },
        reviewMemoVersions: [],
        humanReviews: [],
        reviewerActions: [],
      }) as Awaited<ReturnType<typeof prisma.classificationRun.findFirst>>) as typeof prisma.classificationRun.findFirst;

    prisma.publicDemoPublication.findUnique = (async () => null) as unknown as typeof prisma.publicDemoPublication.findUnique;

    const status = await getClassificationRunDemoPublicationStatus('org_1', 'run_upload_demo');

    assert.ok(status);
    assert.equal(status.canPublish, true);
    assert.equal(status.publishBlockReason, null);
    assert.equal(status.isPublished, false);
  } finally {
    prisma.classificationRun.findFirst = originalFindFirst;
    prisma.publicDemoPublication.findUnique = originalFindUnique;
  }
});

test('demo publication status explains validation blockers', async () => {
  const originalFindFirst = prisma.classificationRun.findFirst;
  const originalFindUnique = prisma.publicDemoPublication.findUnique;

  try {
    prisma.classificationRun.findFirst = (async () =>
      ({
        id: 'run_blocked_demo',
        organizationId: 'org_1',
        documentId: 'doc_1',
        status: 'completed',
        workflowState: 'awaiting_reviewer_assignment',
        trigger: 'manual',
        confidence: 0.64,
        confidenceRationale: 'Evidence package complete.',
        uncertaintyFlags: [],
        requiresHumanReview: true,
        reviewerAssignedUserId: null,
        reviewerClaimedAt: null,
        finalInternalRecommendation: null,
        conclusionDisclaimer: null,
        lastReviewerActionAt: null,
        workerJobId: null,
        workerVersion: null,
        rulesVersion: null,
        extractedTextPath: null,
        structuredOutputPath: null,
        memoArtifactPath: null,
        capabilitySignals: null,
        validationIssues: [{ code: 'X', severity: 'error' }],
        errorMessage: 'blocked',
        completedAt: new Date('2026-06-30T12:00:00.000Z'),
        createdAt: new Date('2026-06-30T11:55:00.000Z'),
        updatedAt: new Date('2026-06-30T12:00:00.000Z'),
        document: {
          id: 'doc_1',
          organizationId: 'org_1',
          title: 'Shared technical datasheet',
          fileName: 'shared-technical-datasheet.pdf',
          displayFileName: 'shared-technical-datasheet.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 123456,
          storagePath: 'private/shared-technical-datasheet.pdf',
          sourceType: 'upload',
          documentType: 'Datasheet',
          manufacturer: 'Example Semi',
          sourceUrl: null,
          sourceDate: null,
          versionLabel: 'Rev A',
          sha256: null,
          pageCount: 12,
          extractionStatus: 'completed',
          origin: 'customer_provided',
          visibility: 'private',
          rawText: 'Source-backed technical text.',
          createdAt: new Date('2026-06-30T11:50:00.000Z'),
          updatedAt: new Date('2026-06-30T11:50:00.000Z'),
        },
        extractedSpecs: [],
        factIssues: [],
        reviewPaths: [],
        eccnCandidates: [],
        reviewMemo: {
          id: 'memo_1',
          organizationId: 'org_1',
          classificationRunId: 'run_blocked_demo',
          contentMarkdown: '# Draft ECCN Review Memo',
          disclaimer: 'Draft review memo.',
          generatedBy: 'worker',
          versionNumber: 1,
          reviewStateSnapshot: 'draft_generated',
          reviewerStatusSnapshot: 'pending_review',
          createdAt: new Date('2026-06-30T12:00:00.000Z'),
          updatedAt: new Date('2026-06-30T12:00:00.000Z'),
        },
        reviewMemoVersions: [],
        humanReviews: [],
        reviewerActions: [],
      }) as Awaited<ReturnType<typeof prisma.classificationRun.findFirst>>) as typeof prisma.classificationRun.findFirst;

    prisma.publicDemoPublication.findUnique = (async () => null) as unknown as typeof prisma.publicDemoPublication.findUnique;

    const status = await getClassificationRunDemoPublicationStatus('org_1', 'run_blocked_demo');

    assert.ok(status);
    assert.equal(status.canPublish, false);
    assert.match(status.publishBlockReason ?? '', /unresolved validation issues/i);
  } finally {
    prisma.classificationRun.findFirst = originalFindFirst;
    prisma.publicDemoPublication.findUnique = originalFindUnique;
  }
});
