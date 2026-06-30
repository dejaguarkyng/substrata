import fs from 'node:fs/promises';
import {
  Prisma,
  prisma,
  type ECCNCandidateStatus,
  type FactVerificationStatus,
  type HumanReviewStatus,
  type ReviewPathStatus,
  type ReviewWorkflowState,
  type ReviewerActionType,
} from '@substrata/db';
import { recordAuditEvent } from './audit.service';
import { HttpError } from '../lib/errors';
import { createStorageDriver } from './storage';
import { runLocalWorker } from './worker-runtime';

const storage = createStorageDriver();
const PUBLIC_DEMO_PUBLICATION_ID = 'global-public-demo';

const classificationRunInclude = {
  document: true,
  extractedSpecs: {
    orderBy: {
      createdAt: 'asc',
    },
  },
  factIssues: {
    orderBy: {
      createdAt: 'asc',
    },
  },
  reviewPaths: {
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      facts: {
        include: {
          extractedSpec: true,
        },
      },
      citations: {
        include: {
          regulationSource: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  },
  eccnCandidates: {
    include: {
      citations: {
        include: {
          regulationSource: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      regulationSource: true,
      factMappings: {
        include: {
          extractedSpec: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
  reviewMemo: true,
  reviewMemoVersions: {
    orderBy: {
      versionNumber: 'desc',
    },
  },
  humanReviews: {
    include: {
      reviewer: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  },
  reviewerActions: {
    include: {
      actorUser: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  },
} as const;

function confidenceLevelToScore(level: string) {
  switch (level) {
    case 'high':
      return 0.82;
    case 'low':
      return 0.42;
    default:
      return 0.63;
  }
}

function isDevelopment() {
  return process.env.NODE_ENV !== 'production';
}

function generatedByForWorker(output: Awaited<ReturnType<typeof runLocalWorker>>) {
  const metadata = output.runMetadata ?? {};
  const mode = metadata.classificationMode;
  const provider = metadata.aiProvider;
  const model = metadata.aiModel;
  if (mode === 'ai_assisted' && provider === 'gemini' && typeof model === 'string') {
    return `python_local_worker:gemini:${model}`;
  }
  if (mode === 'heuristic_fallback') {
    return 'python_local_worker:heuristic_fallback';
  }
  return 'python_local_worker:heuristic';
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function createReviewerAction(input: {
  organizationId: string;
  classificationRunId: string;
  actorUserId: string;
  actionType: ReviewerActionType;
  targetType: string;
  targetId: string;
  details?: Prisma.InputJsonValue;
}) {
  await prisma.reviewerAction.create({
    data: {
      organizationId: input.organizationId,
      classificationRunId: input.classificationRunId,
      actorUserId: input.actorUserId,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      details: input.details,
    },
  });
}

async function ensureRegulationSource(
  tx: Prisma.TransactionClient,
  organizationId: string,
  source: {
    authority: string;
    regulationTitle: string;
    regulationVersion?: string | null;
    citationText: string;
    citationUrl?: string | null;
    sourceIdentifier?: string | null;
    section?: string | null;
    paragraph?: string | null;
    kind: 'primary_regulation' | 'agency_guidance' | 'internal_playbook' | 'reviewer_note';
    lastVerifiedAt?: string | null;
    verificationStatus: 'current' | 'needs_verification' | 'archived' | 'superseded';
  },
) {
  return tx.regulationSource.create({
    data: {
      organizationId,
      authority: source.authority,
      regulationTitle: source.regulationTitle,
      regulationVersion: source.regulationVersion ?? null,
      citationText: source.citationText,
      citationUrl: source.citationUrl ?? null,
      sourceIdentifier: source.sourceIdentifier ?? null,
      section: source.section ?? null,
      paragraph: source.paragraph ?? null,
      kind: source.kind,
      lastVerifiedAt: source.lastVerifiedAt ? new Date(source.lastVerifiedAt) : null,
      verificationStatus: source.verificationStatus,
    },
  });
}

function deriveWorkflowState(status: HumanReviewStatus, workflowState?: ReviewWorkflowState) {
  if (workflowState) {
    return workflowState;
  }
  switch (status) {
    case 'approved':
      return 'approved_for_internal_use';
    case 'rejected':
      return 'escalated';
    case 'needs_more_information':
      return 'needs_additional_documentation';
    case 'reviewed':
      return 'reviewer_conclusion_recorded';
    case 'pending_review':
    default:
      return 'in_technical_review';
  }
}

export async function createClassificationRun(input: {
  documentId: string;
  organizationId: string;
  actorUserId: string;
  trigger: string;
}) {
  const document = await prisma.document.findFirstOrThrow({
    where: {
      id: input.documentId,
      organizationId: input.organizationId,
    },
  });

  const run = await prisma.classificationRun.create({
    data: {
      organizationId: input.organizationId,
      documentId: input.documentId,
      trigger: input.trigger,
      status: 'pending',
      workflowState: 'draft_generated',
      uncertaintyFlags: ['limited_regulatory_coverage'],
      requiresHumanReview: true,
      conclusionDisclaimer:
        'Classification support, not legal advice. Requires qualified reviewer confirmation.',
    },
  });

  await recordAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actor: 'user',
    action: 'classification_run.started',
    entityType: 'ClassificationRun',
    entityId: run.id,
    metadata: {
      documentId: document.id,
      trigger: input.trigger,
    },
  });

  try {
    const sourceText =
      document.rawText ??
      (await fs.readFile(storage.resolve(document.storagePath), 'utf8').catch(() => null));

    if (!sourceText) {
      throw new HttpError(400, 'Document content is unavailable for classification.', {
        documentId: document.id,
        storagePath: document.storagePath,
      });
    }

    const workerOutput = await runLocalWorker({
      documentId: document.id,
      organizationId: input.organizationId,
      sourceText,
      documentTitle: document.title,
      documentMetadata: {
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        sourceType: document.sourceType,
      },
    });

    if (isDevelopment()) {
      console.log('Classification worker output summary', {
        documentId: document.id,
        extractedFactCount: workerOutput.extractedSpecs.length,
        reviewPathCount: workerOutput.reviewPaths.length,
        candidateECCNs: workerOutput.eccnCandidates.map((candidate) => candidate.eccn),
      });
    }

    const updatedRun = await prisma.$transaction(async (tx) => {
      const runRecord = await tx.classificationRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          workflowState: 'awaiting_reviewer_assignment',
          confidence: workerOutput.confidence,
          confidenceRationale: workerOutput.confidenceRationale,
          uncertaintyFlags: workerOutput.uncertaintyFlags,
          workerJobId: `local-worker-${run.id}`,
          workerVersion: 'python-local-v4',
          rulesVersion: 'ear-review-v4',
          extractedTextPath: workerOutput.artifacts.extractedTextPath,
          structuredOutputPath: workerOutput.artifacts.structuredOutputPath,
          memoArtifactPath: workerOutput.artifacts.memoPath,
          completedAt: new Date(),
        },
      });

      const createdFacts = await Promise.all(
        workerOutput.extractedSpecs.map((spec) =>
          tx.extractedSpec.create({
            data: {
              organizationId: input.organizationId,
              classificationRunId: run.id,
              sourceDocumentId: document.id,
              name: spec.name,
              label: spec.displayName,
              value: spec.value,
              unit: spec.unit ?? null,
              sourceSnippet: spec.sourceSnippet,
              sourceText: spec.sourceText ?? spec.sourceSnippet,
              sourcePageFrom: spec.sourcePageFrom ?? null,
              sourcePageTo: spec.sourcePageTo ?? spec.sourcePageFrom ?? null,
              boundingBoxes: spec.boundingBoxes ?? Prisma.JsonNull,
              importance: spec.importance,
              extractionRationale: spec.extractionRationale,
              confidence: confidenceLevelToScore(spec.confidence),
              confidenceLevel: spec.confidence,
              category: spec.category,
              valueType: spec.valueType,
              extractionMethod: spec.extractionMethod,
              extractionMethodVersion: spec.extractionMethodVersion,
            },
          }),
        ),
      );

      const factByName = new Map<string, typeof createdFacts>();
      for (const fact of createdFacts) {
        const facts = factByName.get(fact.name) ?? [];
        facts.push(fact);
        factByName.set(fact.name, facts);
      }

      for (const issue of workerOutput.factIssues) {
        await tx.factIssue.create({
          data: {
            organizationId: input.organizationId,
            classificationRunId: run.id,
            issueType: issue.issueType,
            summary: issue.summary,
            details: issue.details ?? null,
            primaryFactId: issue.primaryFactName
              ? factByName.get(issue.primaryFactName)?.[0]?.id ?? null
              : null,
            relatedFactId: issue.relatedFactName
              ? factByName.get(issue.relatedFactName)?.[0]?.id ?? null
              : null,
          },
        });
      }

      const reviewPathIdByKey = new Map<string, string>();

      for (const reviewPath of workerOutput.reviewPaths) {
        const createdPath = await tx.reviewPath.create({
          data: {
            organizationId: input.organizationId,
            classificationRunId: run.id,
            type: reviewPath.type,
            status: reviewPath.status,
            title: reviewPath.title,
            scope: reviewPath.scope,
            whyTriggered: reviewPath.whyTriggered,
            technicalRiskArea: reviewPath.technicalRiskArea ?? null,
            missingInformation: reviewPath.missingInformation,
            reviewerQuestions: reviewPath.reviewerQuestions,
            reviewerNotes: reviewPath.reviewerNotes ?? null,
            decisionRationale: reviewPath.decisionRationale ?? null,
          },
        });

        reviewPathIdByKey.set(reviewPath.pathKey, createdPath.id);

        for (const factName of reviewPath.triggeredFactNames) {
          const fact = factByName.get(factName)?.[0];
          if (!fact) {
            continue;
          }
          await tx.reviewPathFact.create({
            data: {
              reviewPathId: createdPath.id,
              extractedSpecId: fact.id,
            },
          });
        }

        for (const citation of reviewPath.regulatoryCitations) {
          const source = await ensureRegulationSource(
            tx,
            input.organizationId,
            citation.regulationSource,
          );
          await tx.citation.create({
            data: {
              organizationId: input.organizationId,
              classificationRunId: run.id,
              reviewPathId: createdPath.id,
              regulationSourceId: source.id,
              sourceTitle: citation.citationLabel,
              sourceUrl: source.citationUrl,
              sourceSection:
                source.section ?? source.paragraph ?? citation.source,
              quotedText: citation.citationText,
              relevanceNote: citation.relevance,
            },
          });
        }
      }

      for (const candidate of workerOutput.eccnCandidates) {
        const regulationSource = await ensureRegulationSource(
          tx,
          input.organizationId,
          candidate.regulationSource,
        );

        const createdCandidate = await tx.eCCNCandidate.create({
          data: {
            organizationId: input.organizationId,
            classificationRunId: run.id,
            eccn: candidate.eccn,
            title: candidate.title,
            officialTitle: candidate.officialTitle,
            rationale: candidate.whyItMayApply,
            confidence: confidenceLevelToScore(candidate.confidence),
            confidenceLevel: candidate.confidence,
            confidenceRationale: candidate.confidenceRationale,
            status: candidate.status,
            regulationSourceId: regulationSource.id,
            regulationVersion: candidate.regulationSource.regulationVersion ?? null,
            paragraphReference: candidate.paragraphReference ?? null,
            controlCriteria: candidate.controlCriteria,
            matchedTechnicalFacts: candidate.matchedTechnicalFacts,
            whyItMayApply: candidate.whyItMayApply,
            whyItMayNotApply: candidate.whyItMayNotApply,
            mayApplyReasons: candidate.mayApplyReasons,
            mayNotApplyReasons: candidate.mayNotApplyReasons,
            missingInformation: candidate.missingInformation,
            reviewerQuestions: candidate.reviewerQuestions,
            uncertaintyFlags: candidate.uncertaintyFlags,
            alternativeCandidates: candidate.alternativeCandidates,
            reviewPathId: candidate.reviewPathKey
              ? reviewPathIdByKey.get(candidate.reviewPathKey) ?? null
              : null,
            isSpecificEccn: true,
          },
        });

        for (const mapping of candidate.factMappings) {
          const fact = factByName.get(mapping.factName)?.[0];
          if (!fact) {
            continue;
          }
          await tx.candidateFactMapping.create({
            data: {
              eccnCandidateId: createdCandidate.id,
              extractedSpecId: fact.id,
              criterionLabel: mapping.criterionLabel,
              matchedValue: mapping.matchedValue,
              comparisonResult: mapping.comparisonResult,
              notes: mapping.notes ?? null,
            },
          });
        }

        await tx.citation.create({
          data: {
            organizationId: input.organizationId,
            classificationRunId: run.id,
            eccnCandidateId: createdCandidate.id,
            regulationSourceId: regulationSource.id,
            sourceTitle: `${candidate.eccn} official regulation source`,
            sourceUrl: regulationSource.citationUrl,
            sourceSection:
              candidate.paragraphReference ??
              regulationSource.section ??
              regulationSource.paragraph,
            quotedText: regulationSource.citationText,
            relevanceNote: candidate.whyItMayApply,
          },
        });
      }

      const generatedBy = generatedByForWorker(workerOutput);
      const memo = await tx.reviewMemo.create({
        data: {
          organizationId: input.organizationId,
          classificationRunId: run.id,
          contentMarkdown: workerOutput.memoMarkdown,
          generatedBy,
          versionNumber: 1,
          reviewStateSnapshot: 'draft_generated',
          reviewerStatusSnapshot: 'pending_review',
          disclaimer:
            'Draft review memo. Classification support, not legal advice. Requires qualified reviewer confirmation.',
        },
      });

      await tx.reviewMemoVersion.create({
        data: {
          organizationId: input.organizationId,
          classificationRunId: run.id,
          versionNumber: 1,
          contentMarkdown: workerOutput.memoMarkdown,
          generatedBy,
          reviewStateSnapshot: 'draft_generated',
          reviewerStatusSnapshot: 'pending_review',
          disclaimer:
            'Draft review memo. Classification support, not legal advice. Requires qualified reviewer confirmation.',
        },
      });

      await tx.humanReview.create({
        data: {
          organizationId: input.organizationId,
          classificationRunId: run.id,
          reviewerId: input.actorUserId,
          status: 'pending_review',
          workflowState: 'awaiting_reviewer_assignment',
        },
      });

      await createReviewerAction({
        organizationId: input.organizationId,
        classificationRunId: run.id,
        actorUserId: input.actorUserId,
        actionType: 'update_workflow',
        targetType: 'ClassificationRun',
        targetId: run.id,
        details: {
          workflowState: 'draft_generated',
          memoId: memo.id,
        },
      });

      return runRecord;
    });

    await recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actor: 'worker',
      action: 'classification_run.completed',
      entityType: 'ClassificationRun',
      entityId: run.id,
      metadata: {
        workerJobId: `local-worker-${run.id}`,
        confidence: workerOutput.confidence,
        workflowState: 'awaiting_reviewer_assignment',
      },
    });

    await recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actor: 'worker',
      action: 'memo.generated',
      entityType: 'ReviewMemo',
      entityId: run.id,
      metadata: {
        generatedBy: generatedByForWorker(workerOutput),
        versionNumber: 1,
      },
    });

    const hydratedRun = await getClassificationRun(input.organizationId, updatedRun.id);
    if (!hydratedRun) {
      throw new HttpError(500, 'Completed classification run could not be loaded.');
    }

    return hydratedRun;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Classification run did not complete.';

    await prisma.classificationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        workflowState: 'draft_generated',
        errorMessage: message,
      },
    });

    await recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actor: 'worker',
      action: 'classification_run.failed',
      entityType: 'ClassificationRun',
      entityId: run.id,
      metadata: {
        error: message,
      },
    });

    throw error;
  }
}

export async function claimClassificationRun(input: {
  classificationRunId: string;
  organizationId: string;
  reviewerId: string;
}) {
  const run = await getClassificationRun(input.organizationId, input.classificationRunId);
  if (!run) {
    throw new HttpError(404, 'Classification run not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.classificationRun.update({
      where: { id: run.id },
      data: {
        reviewerAssignedUserId: input.reviewerId,
        reviewerClaimedAt: new Date(),
        workflowState: 'in_technical_review',
        lastReviewerActionAt: new Date(),
      },
    });

    const currentReview = run.humanReviews[0];
    if (currentReview) {
      await tx.humanReview.update({
        where: { id: currentReview.id },
        data: {
          reviewerId: input.reviewerId,
          claimedAt: new Date(),
          workflowState: 'in_technical_review',
          status: 'pending_review',
        },
      });
    }
  });

  await createReviewerAction({
    organizationId: input.organizationId,
    classificationRunId: run.id,
    actorUserId: input.reviewerId,
    actionType: 'claim_review',
    targetType: 'ClassificationRun',
    targetId: run.id,
  });

  await recordAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.reviewerId,
    actor: 'user',
    action: 'review.claimed',
    entityType: 'ClassificationRun',
    entityId: run.id,
  });

  return getClassificationRun(input.organizationId, run.id);
}

export async function updateExtractedFactReview(input: {
  classificationRunId: string;
  organizationId: string;
  reviewerId: string;
  factId: string;
  reviewerStatus: FactVerificationStatus;
  reviewerNote?: string;
  reviewerCorrectedValue?: string;
  reviewerCorrectedUnit?: string;
  suppressFromMemo?: boolean;
}) {
  const fact = await prisma.extractedSpec.findFirst({
    where: {
      id: input.factId,
      classificationRunId: input.classificationRunId,
      organizationId: input.organizationId,
    },
  });

  if (!fact) {
    throw new HttpError(404, 'Extracted fact not found.');
  }

  const updated = await prisma.extractedSpec.update({
    where: { id: fact.id },
    data: {
      reviewerStatus: input.reviewerStatus,
      reviewerNote: normalizeOptionalText(input.reviewerNote),
      reviewerCorrectedValue: normalizeOptionalText(input.reviewerCorrectedValue),
      reviewerCorrectedUnit: normalizeOptionalText(input.reviewerCorrectedUnit),
      suppressFromMemo: Boolean(input.suppressFromMemo),
    },
  });

  await prisma.classificationRun.update({
    where: { id: input.classificationRunId },
    data: {
      lastReviewerActionAt: new Date(),
      workflowState: 'in_technical_review',
    },
  });

  const actionType: ReviewerActionType =
    input.reviewerStatus === 'verified'
      ? 'verify_fact'
      : input.reviewerStatus === 'rejected'
        ? 'reject_fact'
        : input.reviewerStatus === 'suppressed'
          ? 'suppress_fact'
          : 'correct_fact';

  await createReviewerAction({
    organizationId: input.organizationId,
    classificationRunId: input.classificationRunId,
    actorUserId: input.reviewerId,
    actionType,
    targetType: 'ExtractedFact',
    targetId: fact.id,
    details: {
      reviewerStatus: input.reviewerStatus,
      suppressFromMemo: Boolean(input.suppressFromMemo),
    },
  });

  await recordAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.reviewerId,
    actor: 'user',
    action: 'fact.review_updated',
    entityType: 'ExtractedFact',
    entityId: fact.id,
    metadata: {
      classificationRunId: input.classificationRunId,
      reviewerStatus: input.reviewerStatus,
    },
  });

  return updated;
}

export async function updateReviewPathRecord(input: {
  classificationRunId: string;
  organizationId: string;
  reviewerId: string;
  reviewPathId: string;
  status: ReviewPathStatus;
  reviewerNotes?: string;
  decisionRationale?: string;
  missingInformation: string[];
  reviewerQuestions: string[];
}) {
  const reviewPath = await prisma.reviewPath.findFirst({
    where: {
      id: input.reviewPathId,
      classificationRunId: input.classificationRunId,
      organizationId: input.organizationId,
    },
  });
  if (!reviewPath) {
    throw new HttpError(404, 'Review path not found.');
  }

  const updated = await prisma.reviewPath.update({
    where: { id: reviewPath.id },
    data: {
      status: input.status,
      reviewerNotes: normalizeOptionalText(input.reviewerNotes),
      decisionRationale: normalizeOptionalText(input.decisionRationale),
      missingInformation: input.missingInformation,
      reviewerQuestions: input.reviewerQuestions,
    },
  });

  await prisma.classificationRun.update({
    where: { id: input.classificationRunId },
    data: {
      workflowState: input.status === 'escalated' ? 'escalated' : 'in_technical_review',
      lastReviewerActionAt: new Date(),
    },
  });

  await createReviewerAction({
    organizationId: input.organizationId,
    classificationRunId: input.classificationRunId,
    actorUserId: input.reviewerId,
    actionType: 'update_review_path',
    targetType: 'ReviewPath',
    targetId: reviewPath.id,
    details: {
      status: input.status,
    },
  });

  await recordAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.reviewerId,
    actor: 'user',
    action: 'review_path.updated',
    entityType: 'ReviewPath',
    entityId: reviewPath.id,
    metadata: {
      classificationRunId: input.classificationRunId,
      status: input.status,
    },
  });

  return updated;
}

export async function updateECCNCandidateRecord(input: {
  classificationRunId: string;
  organizationId: string;
  reviewerId: string;
  candidateId: string;
  status: ECCNCandidateStatus;
  reviewerDisposition?: string;
  reviewerDispositionRationale?: string;
  confidenceRationale?: string;
  alternativeCandidates: Array<{
    eccn: string;
    title: string;
    status: 'considered' | 'excluded' | 'open';
    rationale: string;
  }>;
}) {
  const candidate = await prisma.eCCNCandidate.findFirst({
    where: {
      id: input.candidateId,
      classificationRunId: input.classificationRunId,
      organizationId: input.organizationId,
    },
  });
  if (!candidate) {
    throw new HttpError(404, 'ECCN candidate not found.');
  }

  const updated = await prisma.eCCNCandidate.update({
    where: { id: candidate.id },
    data: {
      status: input.status,
      reviewerDisposition: normalizeOptionalText(input.reviewerDisposition),
      reviewerDispositionRationale: normalizeOptionalText(
        input.reviewerDispositionRationale,
      ),
      confidenceRationale:
        normalizeOptionalText(input.confidenceRationale) ?? candidate.confidenceRationale,
      alternativeCandidates: input.alternativeCandidates,
    },
  });

  await prisma.classificationRun.update({
    where: { id: input.classificationRunId },
    data: {
      lastReviewerActionAt: new Date(),
      workflowState:
        input.status === 'approved' ? 'reviewer_conclusion_recorded' : 'in_technical_review',
    },
  });

  await createReviewerAction({
    organizationId: input.organizationId,
    classificationRunId: input.classificationRunId,
    actorUserId: input.reviewerId,
    actionType: 'update_eccn_candidate',
    targetType: 'ECCNCandidate',
    targetId: candidate.id,
    details: {
      status: input.status,
    },
  });

  await recordAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.reviewerId,
    actor: 'user',
    action: 'eccn_candidate.updated',
    entityType: 'ECCNCandidate',
    entityId: candidate.id,
    metadata: {
      classificationRunId: input.classificationRunId,
      status: input.status,
    },
  });

  return updated;
}

export async function submitClassificationReview(input: {
  classificationRunId: string;
  organizationId: string;
  reviewerId: string;
  status: HumanReviewStatus;
  workflowState?: ReviewWorkflowState;
  note: string;
  approvalScope?: string;
  finalInternalRecommendation?: string;
  caveats?: string;
  assumptions?: string;
  missingInformation?: string;
}) {
  const existingRun = await getClassificationRun(
    input.organizationId,
    input.classificationRunId,
  );

  if (!existingRun) {
    throw new HttpError(404, 'Classification run not found.');
  }

  const currentReview = existingRun.humanReviews[0];
  if (!currentReview) {
    throw new HttpError(400, 'No human review record exists for this run.');
  }

  const note = input.note.trim();
  const workflowState = deriveWorkflowState(input.status, input.workflowState);
  const isConclusionRecorded = [
    'reviewed',
    'approved',
    'rejected',
  ].includes(input.status);

  const updatedReview = await prisma.humanReview.update({
    where: { id: currentReview.id },
    data: {
      status: input.status,
      workflowState,
      notes: note || null,
      approvalScope: normalizeOptionalText(input.approvalScope),
      finalInternalRecommendation: normalizeOptionalText(
        input.finalInternalRecommendation,
      ),
      caveats: normalizeOptionalText(input.caveats),
      assumptions: normalizeOptionalText(input.assumptions),
      missingInformation: normalizeOptionalText(input.missingInformation),
      reviewedAt: input.status === 'pending_review' ? null : new Date(),
      conclusionRecordedAt: isConclusionRecorded ? new Date() : null,
      reviewerId: input.reviewerId,
    },
    include: {
      reviewer: true,
    },
  });

  await prisma.classificationRun.update({
    where: { id: input.classificationRunId },
    data: {
      workflowState,
      finalInternalRecommendation: normalizeOptionalText(
        input.finalInternalRecommendation,
      ),
      lastReviewerActionAt: new Date(),
    },
  });

  await createReviewerAction({
    organizationId: input.organizationId,
    classificationRunId: input.classificationRunId,
    actorUserId: input.reviewerId,
    actionType: 'record_conclusion',
    targetType: 'HumanReview',
    targetId: updatedReview.id,
    details: {
      status: input.status,
      workflowState,
      hasConclusion: isConclusionRecorded,
    },
  });

  await recordAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.reviewerId,
    actor: 'user',
    action: 'review.status_changed',
    entityType: 'HumanReview',
    entityId: updatedReview.id,
    metadata: {
      classificationRunId: input.classificationRunId,
      status: input.status,
      workflowState,
      hasConclusion: isConclusionRecorded,
    },
  });

  if (note) {
    await recordAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.reviewerId,
      actor: 'user',
      action: 'review.note_added',
      entityType: 'HumanReview',
      entityId: updatedReview.id,
      metadata: {
        classificationRunId: input.classificationRunId,
        noteLength: note.length,
      },
    });
  }

  return updatedReview;
}

export async function publishClassificationRunAsPublicDemo(input: {
  classificationRunId: string;
  organizationId: string;
  actorUserId: string;
  confirmation: boolean;
  publicTitle?: string | null;
  publicSummary?: string | null;
  sourceDocumentDisplayName?: string | null;
}) {
  if (!input.confirmation) {
    throw new HttpError(
      400,
      'Public demo publication requires the explicit public-sharing confirmation.',
    );
  }

  const existingRun = await getClassificationRun(
    input.organizationId,
    input.classificationRunId,
  );

  if (!existingRun) {
    throw new HttpError(404, 'Classification run not found.');
  }

  if (existingRun.status !== 'completed' || !existingRun.completedAt) {
    throw new HttpError(409, 'Only completed classification runs can be published.');
  }

  if (!existingRun.reviewMemo) {
    throw new HttpError(409, 'A draft review memo is required before publishing.');
  }

  const publication = await prisma.$transaction(async (tx) => {
    const current = await tx.publicDemoPublication.findUnique({
      where: { id: PUBLIC_DEMO_PUBLICATION_ID },
    });

    return tx.publicDemoPublication
      .upsert({
        where: { id: PUBLIC_DEMO_PUBLICATION_ID },
        create: {
          id: PUBLIC_DEMO_PUBLICATION_ID,
          status: 'published',
          activeClassificationRunId: existingRun.id,
          publishedAt: new Date(),
          publishedByUserId: input.actorUserId,
          publicTitle:
            normalizeOptionalText(input.publicTitle) ??
            `${existingRun.document.title} demo technical workup`,
          publicSummary:
            normalizeOptionalText(input.publicSummary) ??
            'Demo using publicly available technical documentation. Example technical workup, not a customer conclusion.',
          sourceDocumentDisplayName: normalizeOptionalText(
            input.sourceDocumentDisplayName,
          ),
        },
        update: {
          status: 'published',
          activeClassificationRunId: existingRun.id,
          publishedAt: new Date(),
          publishedByUserId: input.actorUserId,
          publicTitle:
            normalizeOptionalText(input.publicTitle) ??
            `${existingRun.document.title} demo technical workup`,
          publicSummary:
            normalizeOptionalText(input.publicSummary) ??
            'Demo using publicly available technical documentation. Example technical workup, not a customer conclusion.',
          sourceDocumentDisplayName: normalizeOptionalText(
            input.sourceDocumentDisplayName,
          ),
        },
        include: {
          activeClassificationRun: {
            include: classificationRunInclude,
          },
        },
      })
      .then((result) => ({
        publication: result,
        previousActiveRunId:
          current?.status === 'published' ? current.activeClassificationRunId : null,
      }));
  });

  await recordAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actor: 'user',
    action:
      publication.previousActiveRunId &&
      publication.previousActiveRunId !== input.classificationRunId
        ? 'public_demo.replaced'
        : 'public_demo.published',
    entityType: 'ClassificationRun',
    entityId: input.classificationRunId,
    metadata: {
      replacedRunId:
        publication.previousActiveRunId &&
        publication.previousActiveRunId !== input.classificationRunId
          ? publication.previousActiveRunId
          : null,
      publicTitle: publication.publication.publicTitle,
      sourceDocumentDisplayName: publication.publication.sourceDocumentDisplayName,
    },
  });

  return publication.publication;
}

export async function unpublishClassificationRunAsPublicDemo(input: {
  classificationRunId: string;
  organizationId: string;
  actorUserId: string;
}) {
  const existingRun = await getClassificationRun(
    input.organizationId,
    input.classificationRunId,
  );

  if (!existingRun) {
    throw new HttpError(404, 'Classification run not found.');
  }

  const current = await prisma.publicDemoPublication.findUnique({
    where: { id: PUBLIC_DEMO_PUBLICATION_ID },
  });

  if (
    !current ||
    current.status !== 'published' ||
    current.activeClassificationRunId !== input.classificationRunId
  ) {
    throw new HttpError(409, 'This run is not currently live as the public demo.');
  }

  const publication = await prisma.publicDemoPublication.update({
    where: { id: PUBLIC_DEMO_PUBLICATION_ID },
    data: {
      status: 'unpublished',
      activeClassificationRunId: null,
      publishedAt: null,
      publishedByUserId: input.actorUserId,
      publicTitle: null,
      publicSummary: null,
      sourceDocumentDisplayName: null,
    },
  });

  await recordAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actor: 'user',
    action: 'public_demo.unpublished',
    entityType: 'ClassificationRun',
    entityId: input.classificationRunId,
    metadata: {
      previousPublishedAt: current.publishedAt,
    },
  });

  return publication;
}

export async function getClassificationRunDemoPublicationStatus(
  organizationId: string,
  classificationRunId: string,
) {
  const run = await getClassificationRun(organizationId, classificationRunId);

  if (!run) {
    return null;
  }

  const publication = await prisma.publicDemoPublication.findUnique({
    where: { id: PUBLIC_DEMO_PUBLICATION_ID },
  });

  const isPublished =
    publication?.status === 'published' &&
    publication.activeClassificationRunId === classificationRunId;

  return {
    canPublish:
      run.status === 'completed' &&
      Boolean(run.reviewMemo) &&
      ['seed', 'public'].includes(run.document.sourceType),
    isPublished,
    publishedAt: isPublished ? publication?.publishedAt ?? null : null,
    publicTitle: isPublished ? publication?.publicTitle ?? null : null,
    publicSummary: isPublished ? publication?.publicSummary ?? null : null,
    sourceDocumentDisplayName: isPublished
      ? publication?.sourceDocumentDisplayName ?? null
      : null,
    canonicalUrl: `/classification-runs/${classificationRunId}`,
    activeDemoRunId:
      publication?.status === 'published' ? publication.activeClassificationRunId : null,
    willReplaceActiveDemo:
      publication?.status === 'published' &&
      publication.activeClassificationRunId !== classificationRunId,
  };
}

export async function getPublicDemoClassificationRun(runId: string) {
  return prisma.publicDemoPublication.findFirst({
    where: {
      id: PUBLIC_DEMO_PUBLICATION_ID,
      status: 'published',
      activeClassificationRunId: runId,
    },
    include: {
      activeClassificationRun: {
        include: classificationRunInclude,
      },
    },
  });
}

export async function getActivePublicDemo() {
  return prisma.publicDemoPublication.findFirst({
    where: {
      id: PUBLIC_DEMO_PUBLICATION_ID,
      status: 'published',
      activeClassificationRunId: {
        not: null,
      },
    },
    include: {
      activeClassificationRun: {
        include: classificationRunInclude,
      },
    },
  });
}

export async function getClassificationRun(
  organizationId: string,
  classificationRunId: string,
) {
  return prisma.classificationRun.findFirst({
    where: {
      id: classificationRunId,
      organizationId,
    },
    include: classificationRunInclude,
  });
}

export async function listClassificationRuns(organizationId: string) {
  return prisma.classificationRun.findMany({
    where: {
      organizationId,
    },
    include: classificationRunInclude,
    orderBy: {
      updatedAt: 'desc',
    },
  });
}

export async function listReviewQueue(organizationId: string) {
  return prisma.classificationRun.findMany({
    where: {
      organizationId,
      requiresHumanReview: true,
      workflowState: {
        in: [
          'draft_generated',
          'awaiting_reviewer_assignment',
          'in_technical_review',
          'needs_additional_documentation',
          'escalated',
        ],
      },
    },
    include: classificationRunInclude,
    orderBy: {
      updatedAt: 'asc',
    },
  });
}

export async function listReviewMemos(organizationId: string) {
  return prisma.reviewMemo.findMany({
    where: {
      organizationId,
    },
    include: {
      classificationRun: {
        include: {
          document: true,
          humanReviews: {
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              reviewer: true,
            },
          },
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
}
