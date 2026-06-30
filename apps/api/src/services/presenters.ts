import type {
  CandidateFactMapping,
  Citation,
  ClassificationRun,
  Document,
  ECCNCandidate,
  ExtractedSpec,
  FactIssue,
  HumanReview,
  PublicDemoPublication,
  RegulationSource,
  ReviewMemo,
  ReviewMemoVersion,
  ReviewPath,
  ReviewPathFact,
  ReviewerAction,
  User,
} from '@substrata/db';

type CitationWithSource = Citation & {
  regulationSource?: RegulationSource | null;
};

type ReviewPathWithRelations = ReviewPath & {
  facts: Array<ReviewPathFact & { extractedSpec: ExtractedSpec }>;
  citations: CitationWithSource[];
};

type ECCNCandidateWithRelations = ECCNCandidate & {
  citations: CitationWithSource[];
  regulationSource?: RegulationSource | null;
  factMappings: Array<CandidateFactMapping & { extractedSpec: ExtractedSpec }>;
};

type RunWithRelations = ClassificationRun & {
  document: Document;
  extractedSpecs: ExtractedSpec[];
  factIssues: FactIssue[];
  reviewPaths: ReviewPathWithRelations[];
  eccnCandidates: ECCNCandidateWithRelations[];
  reviewMemo: ReviewMemo | null;
  reviewMemoVersions: ReviewMemoVersion[];
  humanReviews: Array<HumanReview & { reviewer?: User | null }>;
  reviewerActions: Array<ReviewerAction & { actorUser?: User | null }>;
};

type PublicDemoRunWithPublication = PublicDemoPublication & {
  activeClassificationRun:
    | (RunWithRelations & {
        publicDemoPublication?: PublicDemoPublication | null;
      })
    | null;
};

type DocumentWithRunRelations = Document & {
  classificationRuns?: Array<Record<string, unknown>>;
};

function latestReview(run: RunWithRelations) {
  return run.humanReviews[0] ?? null;
}

function hasRecordedReviewerConclusion(review: HumanReview | null | undefined) {
  return Boolean(review?.conclusionRecordedAt);
}

function formatWorkflowLabel(
  workflowState: ClassificationRun['workflowState'],
  review: HumanReview | null | undefined,
) {
  if (hasRecordedReviewerConclusion(review)) {
    return 'Human-reviewed';
  }

  switch (workflowState) {
    case 'awaiting_reviewer_assignment':
      return 'Awaiting qualified reviewer';
    case 'in_technical_review':
      return 'In technical review';
    case 'needs_additional_documentation':
      return 'Needs more documentation';
    case 'escalated':
      return 'Escalated';
    case 'reviewer_conclusion_recorded':
      return 'Reviewer conclusion recorded';
    case 'approved_for_internal_use':
      return 'Approved for internal use';
    case 'closed':
      return 'Closed';
    case 'draft_generated':
    default:
      return 'Draft generated';
  }
}

function safeDemoDocumentName(publication: PublicDemoPublication, document: Document) {
  return publication.sourceDocumentDisplayName ?? document.displayFileName ?? null;
}

function presentRegulationSource(source?: RegulationSource | null) {
  if (!source) {
    return null;
  }

  return {
    id: source.id,
    authority: source.authority,
    regulationTitle: source.regulationTitle,
    regulationVersion: source.regulationVersion,
    citationText: source.citationText,
    citationUrl: source.citationUrl,
    sourceIdentifier: source.sourceIdentifier,
    section: source.section,
    paragraph: source.paragraph,
    kind: source.kind,
    lastVerifiedAt: source.lastVerifiedAt,
    verificationStatus: source.verificationStatus,
  };
}

function presentCitation(citation: CitationWithSource) {
  return {
    id: citation.id,
    citationLabel: citation.sourceTitle,
    citationText: citation.quotedText,
    source: citation.sourceSection ?? citation.sourceUrl ?? citation.sourceTitle,
    relevance: citation.relevanceNote,
    regulationSource: presentRegulationSource(citation.regulationSource),
  };
}

function presentFact(spec: ExtractedSpec) {
  return {
    id: spec.id,
    canonicalFieldName: spec.name,
    label: spec.label ?? spec.name.replace(/_/g, ' '),
    value: spec.reviewerCorrectedValue ?? spec.value,
    rawExtractedValue: spec.value,
    unit: spec.reviewerCorrectedUnit ?? spec.unit,
    rawExtractedUnit: spec.unit,
    category: spec.category,
    confidence: spec.confidenceLevel,
    extractionRationale: spec.extractionRationale,
    sourceDocumentId: spec.sourceDocumentId,
    sourceSnippet: spec.sourceSnippet,
    sourceText: spec.sourceText ?? spec.sourceSnippet,
    sourcePageFrom: spec.sourcePageFrom,
    sourcePageTo: spec.sourcePageTo,
    boundingBoxes: spec.boundingBoxes,
    importance: spec.importance,
    valueType: spec.valueType,
    extractionMethod: spec.extractionMethod,
    extractionMethodVersion: spec.extractionMethodVersion,
    extractedAt: spec.extractedAt,
    reviewerStatus: spec.reviewerStatus,
    reviewerNote: spec.reviewerNote,
    suppressFromMemo: spec.suppressFromMemo,
  };
}

function presentReviewPath(path: ReviewPathWithRelations) {
  return {
    id: path.id,
    title: path.title,
    scope: path.scope,
    type: path.type,
    status: path.status,
    whyTriggered: path.whyTriggered,
    technicalRiskArea: path.technicalRiskArea,
    missingInformation: path.missingInformation,
    reviewerQuestions: path.reviewerQuestions,
    reviewerNotes: path.reviewerNotes,
    decisionRationale: path.decisionRationale,
    supportingFacts: path.facts.map((item) => presentFact(item.extractedSpec)),
    regulatoryCitations: path.citations.map(presentCitation),
  };
}

function presentCandidate(candidate: ECCNCandidateWithRelations) {
  return {
    id: candidate.id,
    eccn: candidate.eccn,
    title: candidate.title,
    officialTitle: candidate.officialTitle ?? candidate.title,
    status: candidate.status,
    confidence: candidate.confidenceLevel,
    confidenceRationale: candidate.confidenceRationale,
    paragraphReference: candidate.paragraphReference,
    controlCriteria: Array.isArray(candidate.controlCriteria)
      ? candidate.controlCriteria
      : [],
    factMappings: candidate.factMappings.map((mapping) => ({
      id: mapping.id,
      factId: mapping.extractedSpecId,
      factName: mapping.extractedSpec.name,
      criterionLabel: mapping.criterionLabel,
      matchedValue: mapping.matchedValue,
      comparisonResult: mapping.comparisonResult,
      notes: mapping.notes,
    })),
    matchedTechnicalFacts: candidate.matchedTechnicalFacts,
    whyItMayApply: candidate.whyItMayApply,
    whyItMayNotApply: candidate.whyItMayNotApply,
    mayApplyReasons: candidate.mayApplyReasons,
    mayNotApplyReasons: candidate.mayNotApplyReasons,
    missingInformation: candidate.missingInformation,
    uncertaintyFlags: candidate.uncertaintyFlags,
    reviewerQuestions: candidate.reviewerQuestions,
    alternativeCandidates: candidate.alternativeCandidates ?? [],
    reviewerDisposition: candidate.reviewerDisposition,
    reviewerDispositionRationale: candidate.reviewerDispositionRationale,
    reviewPathId: candidate.reviewPathId,
    isSpecificEccn: candidate.isSpecificEccn,
    regulationSource: presentRegulationSource(candidate.regulationSource),
    regulatoryCitations: candidate.citations.map(presentCitation),
  };
}

function presentMemo(record: ReviewMemo | null, versions: ReviewMemoVersion[]) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    contentMarkdown: record.contentMarkdown,
    generatedBy: record.generatedBy,
    versionNumber: record.versionNumber,
    reviewStateSnapshot: record.reviewStateSnapshot,
    reviewerStatusSnapshot: record.reviewerStatusSnapshot,
    disclaimer: record.disclaimer,
    updatedAt: record.updatedAt,
    versions: versions
      .slice()
      .sort((left, right) => right.versionNumber - left.versionNumber)
      .map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        generatedBy: version.generatedBy,
        reviewStateSnapshot: version.reviewStateSnapshot,
        reviewerStatusSnapshot: version.reviewerStatusSnapshot,
        disclaimer: version.disclaimer,
        createdAt: version.createdAt,
      })),
  };
}

function presentHumanReview(review: HumanReview & { reviewer?: User | null }) {
  return {
    id: review.id,
    status: review.status,
    workflowState: review.workflowState,
    notes: review.notes,
    approvalScope: review.approvalScope,
    finalInternalRecommendation: review.finalInternalRecommendation,
    caveats: review.caveats,
    assumptions: review.assumptions,
    missingInformation: review.missingInformation,
    claimedAt: review.claimedAt,
    reviewedAt: review.reviewedAt,
    conclusionRecordedAt: review.conclusionRecordedAt,
    reopenedAt: review.reopenedAt,
    reviewer: review.reviewer
      ? {
          id: review.reviewer.id,
          name: review.reviewer.name,
          email: review.reviewer.email,
        }
      : null,
  };
}

function presentReviewerAction(action: ReviewerAction & { actorUser?: User | null }) {
  return {
    id: action.id,
    actionType: action.actionType,
    targetType: action.targetType,
    targetId: action.targetId,
    details: action.details,
    createdAt: action.createdAt,
    actorUser: action.actorUser
      ? {
          id: action.actorUser.id,
          name: action.actorUser.name,
          email: action.actorUser.email,
        }
      : null,
  };
}

function presentFactIssue(issue: FactIssue) {
  return {
    id: issue.id,
    issueType: issue.issueType,
    summary: issue.summary,
    details: issue.details,
    primaryFactId: issue.primaryFactId,
    relatedFactId: issue.relatedFactId,
  };
}

export function presentRun(run: RunWithRelations) {
  const review = latestReview(run);

  return {
    id: run.id,
    status: run.status,
    workflowState: run.workflowState,
    workflowLabel: formatWorkflowLabel(run.workflowState, review),
    confidence: run.confidence,
    confidenceRationale: run.confidenceRationale,
    uncertaintyFlags: run.uncertaintyFlags,
    requiresHumanReview: run.requiresHumanReview,
    reviewerAssignedUserId: run.reviewerAssignedUserId,
    reviewerClaimedAt: run.reviewerClaimedAt,
    finalInternalRecommendation: run.finalInternalRecommendation,
    conclusionDisclaimer:
      run.conclusionDisclaimer ??
      'Classification support, not legal advice. Requires qualified reviewer confirmation.',
    extractedTextPath: run.extractedTextPath,
    structuredOutputPath: run.structuredOutputPath,
    memoArtifactPath: run.memoArtifactPath,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    lastReviewerActionAt: run.lastReviewerActionAt,
    document: {
      id: run.document.id,
      title: run.document.title,
      fileName: run.document.fileName,
      displayFileName: run.document.displayFileName,
      mimeType: run.document.mimeType,
      sizeBytes: run.document.sizeBytes,
      storagePath: run.document.storagePath,
      sourceType: run.document.sourceType,
      documentType: run.document.documentType,
      manufacturer: run.document.manufacturer,
      sourceUrl: run.document.sourceUrl,
      sourceDate: run.document.sourceDate,
      versionLabel: run.document.versionLabel,
      sha256: run.document.sha256,
      pageCount: run.document.pageCount,
      extractionStatus: run.document.extractionStatus,
      origin: run.document.origin,
      visibility: run.document.visibility,
      summary: run.document.rawText?.slice(0, 420) ?? null,
    },
    extractedSpecs: (run.extractedSpecs ?? []).map(presentFact),
    factIssues: (run.factIssues ?? []).map(presentFactIssue),
    reviewPaths: (run.reviewPaths ?? []).map(presentReviewPath),
    eccnCandidates: (run.eccnCandidates ?? [])
      .filter((candidate) => candidate.isSpecificEccn)
      .map(presentCandidate),
    reviewMemo: presentMemo(run.reviewMemo, run.reviewMemoVersions ?? []),
    humanReviews: (run.humanReviews ?? []).map(presentHumanReview),
    reviewerActions: (run.reviewerActions ?? []).map(presentReviewerAction),
    humanReviewStatus: review?.status ?? 'pending_review',
    hasReviewerConclusion: hasRecordedReviewerConclusion(review),
  };
}

export function presentPublicDemoRun(publication: PublicDemoRunWithPublication) {
  const run = publication.activeClassificationRun;
  if (!run) {
    throw new Error('Public demo publication is missing its active classification run.');
  }

  const review = latestReview(run);

  return {
    id: run.id,
    status: run.status,
    workflowState: run.workflowState,
    workflowLabel: formatWorkflowLabel(run.workflowState, review),
    confidence: run.confidence,
    confidenceRationale: run.confidenceRationale,
    uncertaintyFlags: run.uncertaintyFlags,
    requiresHumanReview: run.requiresHumanReview,
    publicTitle: publication.publicTitle ?? run.document.title,
    publicSummary:
      publication.publicSummary ??
      'Demo using publicly available technical documentation. Example technical workup for qualified reviewer evaluation.',
    sourceDocumentDisplayName: safeDemoDocumentName(publication, run.document),
    canonicalUrl: `/classification-runs/${run.id}`,
    publishedAt: publication.publishedAt,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    document: {
      title: run.document.title,
      displayFileName: run.document.displayFileName,
      mimeType: run.document.mimeType,
      sizeBytes: run.document.sizeBytes,
      sourceType: run.document.sourceType,
      documentType: run.document.documentType,
      manufacturer: run.document.manufacturer,
      versionLabel: run.document.versionLabel,
      pageCount: run.document.pageCount,
      summary: run.document.rawText?.slice(0, 420) ?? null,
    },
    extractedSpecs: run.extractedSpecs.map(presentFact),
    factIssues: run.factIssues.map(presentFactIssue),
    reviewPaths: run.reviewPaths.map(presentReviewPath),
    eccnCandidates: run.eccnCandidates
      .filter((candidate) => candidate.isSpecificEccn)
      .map(presentCandidate),
    reviewMemo: run.reviewMemo
      ? {
          contentMarkdown: run.reviewMemo.contentMarkdown,
          versionNumber: run.reviewMemo.versionNumber,
          reviewStateSnapshot: run.reviewMemo.reviewStateSnapshot,
          reviewerStatusSnapshot: run.reviewMemo.reviewerStatusSnapshot,
          disclaimer: run.reviewMemo.disclaimer,
          updatedAt: run.reviewMemo.updatedAt,
        }
      : null,
    latestReview: review
      ? {
          status: review.status,
          workflowState: review.workflowState,
          notes: review.notes,
          conclusionRecordedAt: review.conclusionRecordedAt,
          reviewedAt: review.reviewedAt,
        }
      : null,
    demoBanner:
      'Demo using publicly available technical documentation. Example technical workup, not a customer conclusion.',
  };
}

export function presentPublicDemoMetadata(publication: PublicDemoRunWithPublication) {
  const run = publication.activeClassificationRun;
  if (!run) {
    throw new Error('Public demo publication is missing its active classification run.');
  }

  return {
    runId: run.id,
    status: publication.status,
    publishedAt: publication.publishedAt,
    publicTitle: publication.publicTitle ?? run.document.title,
    publicSummary:
      publication.publicSummary ??
      'Demo using publicly available technical documentation. Example technical workup for qualified reviewer evaluation.',
    sourceDocumentDisplayName: safeDemoDocumentName(publication, run.document),
    completedAt: run.completedAt,
    canonicalUrl: `/classification-runs/${run.id}`,
  };
}

export function presentDocument(document: DocumentWithRunRelations) {
  return {
    id: document.id,
    title: document.title,
    fileName: document.fileName,
    displayFileName: document.displayFileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    storagePath: document.storagePath,
    sourceType: document.sourceType,
    documentType: document.documentType,
    manufacturer: document.manufacturer,
    sourceUrl: document.sourceUrl,
    sourceDate: document.sourceDate,
    versionLabel: document.versionLabel,
    sha256: document.sha256,
    pageCount: document.pageCount,
    extractionStatus: document.extractionStatus,
    origin: document.origin,
    visibility: document.visibility,
    rawText: document.rawText,
    createdAt: document.createdAt,
    classificationRuns:
      document.classificationRuns?.map((run) =>
        presentRun({
          ...(run as RunWithRelations),
          document:
            ((run as { document?: Document }).document ?? document) as Document,
        }),
      ) ?? [],
  };
}
