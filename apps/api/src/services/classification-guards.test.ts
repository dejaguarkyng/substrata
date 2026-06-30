import assert from 'node:assert/strict';
import test from 'node:test';
import { workerOutputSchema } from '@substrata/shared';
import { presentRun } from './presenters';

function baseWorkerOutput() {
  return {
    documentId: 'doc_1',
    organizationId: 'org_1',
    requiresHumanReview: true,
    confidence: 0.61,
    confidenceRationale: 'Evidence completeness is limited.',
    uncertaintyFlags: ['missing_key_specs'],
    extractedSpecs: [
      {
        name: 'part_number',
        displayName: 'Part number',
        value: 'ABC123',
        unit: null,
        category: 'product_identity',
        sourceSnippet: 'ABC123 device',
        sourceText: 'ABC123 device',
        importance: 'Ties the workup to the reviewed item.',
        confidence: 'high',
        extractionRationale: 'Directly stated.',
        valueType: 'directly_stated',
        extractionMethod: 'test',
        extractionMethodVersion: 'v1',
      },
    ],
    factIssues: [],
    reviewPaths: [],
    eccnCandidates: [],
    memoMarkdown: '# Draft review memo',
    artifacts: {
      extractedTextPath: '/tmp/extracted.txt',
      structuredOutputPath: '/tmp/output.json',
      memoPath: '/tmp/memo.md',
    },
  } as const;
}

test('crypto contradiction guard rejects "not found" path when crypto facts exist', () => {
  const payload = baseWorkerOutput();
  assert.throws(() =>
    workerOutputSchema.parse({
      ...payload,
      extractedSpecs: [
        ...payload.extractedSpecs,
        {
          name: 'secure_boot',
          displayName: 'Secure boot',
          value: 'present',
          unit: null,
          category: 'security_cryptography',
          sourceSnippet: 'Secure boot is supported.',
          sourceText: 'Secure boot is supported.',
          importance: 'Crypto relevance must be reviewed.',
          confidence: 'high',
          extractionRationale: 'Directly stated.',
          valueType: 'directly_stated',
          extractionMethod: 'test',
          extractionMethodVersion: 'v1',
        },
      ],
      reviewPaths: [
        {
          pathKey: 'crypto_review',
          title: 'Category 5 Part 2 encryption review',
          scope: 'Review cryptographic capability.',
          type: 'encryption_security',
          status: 'open',
          whyTriggered: 'Cryptographic features were not found in the source text.',
          triggeredFactNames: ['secure_boot'],
          regulatoryCitations: [],
          missingInformation: [],
          reviewerQuestions: [],
        },
      ],
    }),
  );
});

test('broad category strings cannot be serialized as ECCN candidates', () => {
  const payload = baseWorkerOutput();
  assert.throws(() =>
    workerOutputSchema.parse({
      ...payload,
      eccnCandidates: [
        {
          eccn: 'Category 3',
          title: 'Broad category review',
          officialTitle: 'Broad category review',
          confidence: 'low',
          confidenceRationale: 'Broad category only.',
          status: 'review_required',
          regulationSource: {
            authority: 'BIS / eCFR',
            regulationTitle: 'Category 3',
            regulationVersion: 'current',
            citationText: 'Category 3 text.',
            citationUrl: 'https://www.ecfr.gov/',
            sourceIdentifier: 'Category 3',
            section: 'Category 3',
            paragraph: null,
            kind: 'primary_regulation',
            verificationStatus: 'current',
          },
          controlCriteria: ['Broad comparison'],
          factMappings: [
            {
              factName: 'part_number',
              criterionLabel: 'Identity',
              matchedValue: 'ABC123',
              comparisonResult: 'Not enough',
            },
          ],
          matchedTechnicalFacts: ['part_number: ABC123'],
          whyItMayApply: 'Broad category only.',
          whyItMayNotApply: 'Not specific.',
          mayApplyReasons: ['Broad comparison'],
          mayNotApplyReasons: ['Not a specific ECCN'],
          missingInformation: [],
          uncertaintyFlags: ['missing_key_specs'],
          reviewerQuestions: [],
          alternativeCandidates: [],
          reviewPathKey: null,
        },
      ],
    }),
  );
});

test('ECCN candidates require an official regulation source kind', () => {
  const payload = baseWorkerOutput();
  assert.throws(() =>
    workerOutputSchema.parse({
      ...payload,
      eccnCandidates: [
        {
          eccn: '3A001',
          title: 'Specific review',
          officialTitle: 'Specific review',
          confidence: 'medium',
          confidenceRationale: 'Specific comparison exists.',
          status: 'review_required',
          regulationSource: {
            authority: 'Internal note',
            regulationTitle: 'Analyst note',
            regulationVersion: null,
            citationText: 'Internal interpretation only.',
            citationUrl: null,
            sourceIdentifier: null,
            section: null,
            paragraph: null,
            kind: 'reviewer_note',
            verificationStatus: 'needs_verification',
          },
          controlCriteria: ['Threshold mapping'],
          factMappings: [
            {
              factName: 'part_number',
              criterionLabel: 'Identity',
              matchedValue: 'ABC123',
              comparisonResult: 'Pending',
            },
          ],
          matchedTechnicalFacts: ['part_number: ABC123'],
          whyItMayApply: 'Candidate requires official source.',
          whyItMayNotApply: 'Current source is internal only.',
          mayApplyReasons: ['Placeholder'],
          mayNotApplyReasons: ['No primary regulation source'],
          missingInformation: [],
          uncertaintyFlags: ['missing_key_specs'],
          reviewerQuestions: [],
          alternativeCandidates: [],
          reviewPathKey: null,
        },
      ],
    }),
  );
});

test('run presenter does not label a run human-reviewed without a recorded reviewer conclusion', () => {
  const run = presentRun({
    id: 'run_1',
    organizationId: 'org_1',
    documentId: 'doc_1',
    status: 'completed',
    workflowState: 'reviewer_conclusion_recorded',
    trigger: 'manual',
    confidence: 0.61,
    confidenceRationale: null,
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
    errorMessage: null,
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    document: {
      id: 'doc_1',
      organizationId: 'org_1',
      title: 'Demo document',
      fileName: 'demo.pdf',
      displayFileName: 'demo.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      storagePath: 'demo.pdf',
      sourceType: 'upload',
      documentType: 'Datasheet',
      manufacturer: null,
      sourceUrl: null,
      sourceDate: null,
      versionLabel: null,
      sha256: null,
      pageCount: 1,
      extractionStatus: 'completed',
      extractionError: null,
      origin: 'customer_provided',
      visibility: 'private',
      accessControl: null,
      rawText: 'Demo',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    extractedSpecs: [],
    factIssues: [],
    reviewPaths: [],
    eccnCandidates: [],
    reviewMemo: null,
    reviewMemoVersions: [],
    humanReviews: [
      {
        id: 'review_1',
        organizationId: 'org_1',
        classificationRunId: 'run_1',
        reviewerId: 'user_1',
        status: 'reviewed',
        workflowState: 'reviewer_conclusion_recorded',
        approvalScope: null,
        finalInternalRecommendation: null,
        caveats: null,
        assumptions: null,
        missingInformation: null,
        conclusionRecordedAt: null,
        claimedAt: null,
        reopenedAt: null,
        notes: null,
        reviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewer: {
          id: 'user_1',
          email: 'reviewer@example.com',
          name: 'Reviewer',
          emailVerifiedAt: null,
          onboardingCompletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ],
    reviewerActions: [],
  });

  assert.equal(run.workflowLabel, 'Reviewer conclusion recorded');
  assert.equal(run.hasReviewerConclusion, false);
});
