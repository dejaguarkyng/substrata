import fs from 'node:fs/promises';
import { Router } from 'express';
import {
  eccnCandidateUpdateSchema,
  factReviewUpdateSchema,
  publicDemoPublishSchema,
  reviewPathUpdateSchema,
  reviewSubmissionSchema,
} from '@substrata/shared';
import { canManagePublicDemo, canSubmitReview } from '../lib/authz';
import { parseBody } from '../lib/http';
import {
  claimClassificationRun,
  getClassificationRun,
  getClassificationRunDemoPublicationStatus,
  listClassificationRuns,
  listReviewMemos,
  listReviewQueue,
  publishClassificationRunAsPublicDemo,
  submitClassificationReview,
  unpublishClassificationRunAsPublicDemo,
  updateECCNCandidateRecord,
  updateExtractedFactReview,
  updateReviewPathRecord,
} from '../services/classification.service';
import { presentRun } from '../services/presenters';

type ClassificationRunsRouterDeps = {
  loadClassificationRun?: typeof getClassificationRun;
  listRuns?: typeof listClassificationRuns;
  listQueue?: typeof listReviewQueue;
  listMemosForOrg?: typeof listReviewMemos;
  submitReviewRecord?: typeof submitClassificationReview;
  claimRun?: typeof claimClassificationRun;
  updateFactReview?: typeof updateExtractedFactReview;
  updateReviewPath?: typeof updateReviewPathRecord;
  updateCandidate?: typeof updateECCNCandidateRecord;
  publishDemo?: typeof publishClassificationRunAsPublicDemo;
  unpublishDemo?: typeof unpublishClassificationRunAsPublicDemo;
  getDemoStatus?: typeof getClassificationRunDemoPublicationStatus;
};

export function createClassificationRunsRouter(
  deps: ClassificationRunsRouterDeps = {},
) {
  const classificationRunsRouter = Router();
  const loadClassificationRun = deps.loadClassificationRun ?? getClassificationRun;
  const listRuns = deps.listRuns ?? listClassificationRuns;
  const listQueue = deps.listQueue ?? listReviewQueue;
  const listMemosForOrg = deps.listMemosForOrg ?? listReviewMemos;
  const submitReviewRecord = deps.submitReviewRecord ?? submitClassificationReview;
  const claimRun = deps.claimRun ?? claimClassificationRun;
  const updateFactReview = deps.updateFactReview ?? updateExtractedFactReview;
  const updateReviewPath = deps.updateReviewPath ?? updateReviewPathRecord;
  const updateCandidate = deps.updateCandidate ?? updateECCNCandidateRecord;
  const publishDemo = deps.publishDemo ?? publishClassificationRunAsPublicDemo;
  const unpublishDemo = deps.unpublishDemo ?? unpublishClassificationRunAsPublicDemo;
  const getDemoStatus = deps.getDemoStatus ?? getClassificationRunDemoPublicationStatus;

  classificationRunsRouter.get('/', async (req, res) => {
    const runs = await listRuns(req.authContext!.organization.id);
    res.json(runs.map((run) => presentRun(run)));
  });

  classificationRunsRouter.get('/review-queue', async (req, res) => {
    if (!canSubmitReview(req.authContext!.membership.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to the review queue.',
      });
    }

    const runs = await listQueue(req.authContext!.organization.id);
    res.json(runs.map((run) => presentRun(run)));
  });

  classificationRunsRouter.get('/memos', async (req, res) => {
    const memos = await listMemosForOrg(req.authContext!.organization.id);
    res.json(
      memos.map((memo) => ({
        id: memo.id,
        classificationRunId: memo.classificationRunId,
        documentId: memo.classificationRun.document.id,
        documentTitle: memo.classificationRun.document.title,
        documentFileName: memo.classificationRun.document.fileName,
        generatedBy: memo.generatedBy,
        versionNumber: memo.versionNumber,
        reviewStateSnapshot: memo.reviewStateSnapshot,
        reviewerStatusSnapshot: memo.reviewerStatusSnapshot,
        updatedAt: memo.updatedAt,
        humanReviewStatus:
          memo.classificationRun.humanReviews[0]?.status ?? 'pending_review',
      })),
    );
  });

  classificationRunsRouter.get('/:id', async (req, res) => {
    const { organization } = req.authContext!;
    const run = await loadClassificationRun(organization.id, req.params.id);

    if (!run) {
      return res.status(404).json({ error: 'Classification run not found' });
    }

    return res.json(presentRun(run));
  });

  classificationRunsRouter.get('/:id/demo-publication-status', async (req, res) => {
    const { organization, membership, user } = req.authContext!;

    if (!canManagePublicDemo(membership.role, user.email)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to manage the public demo.',
      });
    }

    const status = await getDemoStatus(organization.id, req.params.id);

    if (!status) {
      return res.status(404).json({ error: 'Classification run not found' });
    }

    return res.json(status);
  });

  classificationRunsRouter.post('/:id/publish-demo', async (req, res) => {
    const { organization, membership, user } = req.authContext!;

    if (!canManagePublicDemo(membership.role, user.email)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to manage the public demo.',
      });
    }

    const input = parseBody(publicDemoPublishSchema, req);
    const publication = await publishDemo({
      classificationRunId: req.params.id,
      organizationId: organization.id,
      actorUserId: user.id,
      confirmation: input.confirmation,
      publicTitle: input.publicTitle,
      publicSummary: input.publicSummary,
      sourceDocumentDisplayName: input.sourceDocumentDisplayName,
    });

    return res.status(200).json({
      isPublished: true,
      activeDemoRunId: publication.activeClassificationRunId,
      canonicalUrl: `/classification-runs/${publication.activeClassificationRunId}`,
      publishedAt: publication.publishedAt,
      publicTitle: publication.publicTitle,
      publicSummary: publication.publicSummary,
      sourceDocumentDisplayName: publication.sourceDocumentDisplayName,
    });
  });

  classificationRunsRouter.post('/:id/unpublish-demo', async (req, res) => {
    const { organization, membership, user } = req.authContext!;

    if (!canManagePublicDemo(membership.role, user.email)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to manage the public demo.',
      });
    }

    await unpublishDemo({
      classificationRunId: req.params.id,
      organizationId: organization.id,
      actorUserId: user.id,
    });

    return res.status(200).json({
      isPublished: false,
      activeDemoRunId: null,
      canonicalUrl: `/classification-runs/${req.params.id}`,
    });
  });

  classificationRunsRouter.get('/:id/memo', async (req, res) => {
    const { organization } = req.authContext!;
    const run = await loadClassificationRun(organization.id, req.params.id);

    if (!run || !run.reviewMemo) {
      return res.status(404).json({ error: 'Classification memo not found' });
    }

    const presentedRun = presentRun(run);

    return res.json({
      classificationRunId: run.id,
      documentId: run.documentId,
      status: run.status,
      workflowState: run.workflowState,
      requiresHumanReview: run.requiresHumanReview,
      humanReviewStatus: run.humanReviews[0]?.status ?? 'pending_review',
      contentMarkdown: run.reviewMemo.contentMarkdown,
      reviewerNote: run.humanReviews[0]?.notes ?? null,
      disclaimer:
        run.reviewMemo.disclaimer ??
        'Draft review memo. Classification support, not legal advice. Requires qualified reviewer confirmation.',
      summary: presentedRun.document.summary,
    });
  });

  classificationRunsRouter.get('/:id/memo/download', async (req, res) => {
    const { organization } = req.authContext!;
    const run = await loadClassificationRun(organization.id, req.params.id);

    if (!run || !run.reviewMemo) {
      return res.status(404).json({ error: 'Classification memo not found' });
    }

    const markdown = run.reviewMemo.contentMarkdown;
    const baseName = run.document.fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    const safeTitle = baseName || run.document.title.replace(/[^a-zA-Z0-9._-]+/g, '-');

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="substrata-eccn-review-${safeTitle}.md"`,
    );

    return res.send(markdown);
  });

  classificationRunsRouter.post('/:id/review', async (req, res) => {
    const input = parseBody(reviewSubmissionSchema, req);
    const { organization, user, membership } = req.authContext!;

    if (!canSubmitReview(membership.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to record a human review decision.',
      });
    }

    const review = await submitReviewRecord({
      classificationRunId: req.params.id,
      organizationId: organization.id,
      reviewerId: user.id,
      status: input.status,
      workflowState: input.workflowState,
      note: input.note ?? '',
      approvalScope: input.approvalScope,
      finalInternalRecommendation: input.finalInternalRecommendation,
      caveats: input.caveats,
      assumptions: input.assumptions,
      missingInformation: input.missingInformation,
    });

    return res.status(201).json(review);
  });

  classificationRunsRouter.post('/:id/claim', async (req, res) => {
    const { organization, membership, user } = req.authContext!;

    if (!canSubmitReview(membership.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to claim a review.',
      });
    }

    const run = await claimRun({
      classificationRunId: req.params.id,
      organizationId: organization.id,
      reviewerId: user.id,
    });

    return res.status(200).json(run ? presentRun(run) : null);
  });

  classificationRunsRouter.patch('/:id/facts/:factId', async (req, res) => {
    const input = parseBody(factReviewUpdateSchema, req);
    const { organization, membership, user } = req.authContext!;

    if (!canSubmitReview(membership.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to review extracted facts.',
      });
    }

    const fact = await updateFactReview({
      classificationRunId: req.params.id,
      organizationId: organization.id,
      reviewerId: user.id,
      factId: req.params.factId,
      reviewerStatus: input.reviewerStatus,
      reviewerNote: input.reviewerNote,
      reviewerCorrectedValue: input.reviewerCorrectedValue,
      reviewerCorrectedUnit: input.reviewerCorrectedUnit,
      suppressFromMemo: input.suppressFromMemo,
    });

    return res.status(200).json(fact);
  });

  classificationRunsRouter.patch('/:id/review-paths/:reviewPathId', async (req, res) => {
    const input = parseBody(reviewPathUpdateSchema, req);
    const { organization, membership, user } = req.authContext!;

    if (!canSubmitReview(membership.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to update review paths.',
      });
    }

    const reviewPath = await updateReviewPath({
      classificationRunId: req.params.id,
      organizationId: organization.id,
      reviewerId: user.id,
      reviewPathId: req.params.reviewPathId,
      status: input.status,
      reviewerNotes: input.reviewerNotes,
      decisionRationale: input.decisionRationale,
      missingInformation: input.missingInformation ?? [],
      reviewerQuestions: input.reviewerQuestions ?? [],
    });

    return res.status(200).json(reviewPath);
  });

  classificationRunsRouter.patch('/:id/eccn-candidates/:candidateId', async (req, res) => {
    const input = parseBody(eccnCandidateUpdateSchema, req);
    const { organization, membership, user } = req.authContext!;

    if (!canSubmitReview(membership.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to update ECCN candidates.',
      });
    }

    const candidate = await updateCandidate({
      classificationRunId: req.params.id,
      organizationId: organization.id,
      reviewerId: user.id,
      candidateId: req.params.candidateId,
      status: input.status,
      reviewerDisposition: input.reviewerDisposition,
      reviewerDispositionRationale: input.reviewerDispositionRationale,
      confidenceRationale: input.confidenceRationale,
      alternativeCandidates: input.alternativeCandidates ?? [],
    });

    return res.status(200).json(candidate);
  });

  classificationRunsRouter.get('/:id/artifacts', async (req, res) => {
    const { organization } = req.authContext!;
    const run = await loadClassificationRun(organization.id, req.params.id);

    if (!run) {
      return res.status(404).json({ error: 'Classification run not found' });
    }

    const [memoPreview, extractedTextPreview] = await Promise.all([
      run.memoArtifactPath
        ? fs.readFile(run.memoArtifactPath, 'utf8').catch(() => null)
        : Promise.resolve(null),
      run.extractedTextPath
        ? fs.readFile(run.extractedTextPath, 'utf8').catch(() => null)
        : Promise.resolve(null),
    ]);

    return res.json({
      classificationRunId: run.id,
      artifacts: {
        extractedTextPath: run.extractedTextPath,
        structuredOutputPath: run.structuredOutputPath,
        memoArtifactPath: run.memoArtifactPath,
      },
      previews: {
        memoPreview,
        extractedTextPreview,
      },
    });
  });

  return classificationRunsRouter;
}

export const classificationRunsRouter = createClassificationRunsRouter();
