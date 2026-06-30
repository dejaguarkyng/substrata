import type { ClassificationRunRecord, DocumentRecord } from './types';

export const mockDashboard = {
  stats: [
    { label: 'Documents', value: '12' },
    { label: 'Active Reviews', value: '4' },
    { label: 'Pending Human Review', value: '7' },
    { label: 'Average Draft Time', value: '6 min' },
  ],
  documents: [
    {
      id: 'doc_demo_1',
      title: 'Radiation-Tolerant Edge Accelerator Datasheet',
      fileName: 'rad-edge-accelerator.txt',
      createdAt: '2026-06-16T08:00:00.000Z',
      sourceType: 'seed',
      classificationRuns: [
        {
          id: 'run_demo_1',
          status: 'completed',
          workflowState: 'awaiting_reviewer_assignment',
          workflowLabel: 'Awaiting qualified reviewer',
          uncertaintyFlags: [
            'multiple_plausible_eccns',
            'requires_engineering_confirmation',
          ],
          requiresHumanReview: true,
          extractedSpecs: [],
          factIssues: [],
          reviewPaths: [],
          eccnCandidates: [],
          reviewMemo: null,
          reviewerActions: [],
          humanReviewStatus: 'pending_review',
          hasReviewerConclusion: false,
          document: {
            id: 'doc_demo_1',
            title: 'Radiation-Tolerant Edge Accelerator Datasheet',
            fileName: 'rad-edge-accelerator.txt',
          },
          humanReviews: [
            { id: 'review_1', status: 'pending_review', workflowState: 'awaiting_reviewer_assignment' },
          ],
        },
      ],
    },
  ] satisfies DocumentRecord[],
};

export const mockRun: ClassificationRunRecord = {
  id: 'run_demo_1',
  status: 'completed',
  workflowState: 'awaiting_reviewer_assignment',
  workflowLabel: 'Awaiting qualified reviewer',
  confidence: 0.64,
  extractedTextPath: '/tmp/substrata/extracted.txt',
  structuredOutputPath: '/tmp/substrata/output.json',
  memoArtifactPath: '/tmp/substrata/memo.md',
  uncertaintyFlags: [
    'multiple_plausible_eccns',
    'requires_engineering_confirmation',
  ],
  requiresHumanReview: true,
  document: {
    id: 'doc_demo_1',
    title: 'Radiation-Tolerant Edge Accelerator Datasheet',
    fileName: 'rad-edge-accelerator.txt',
    mimeType: 'text/plain',
    sizeBytes: 2048,
    storagePath: 'documents/demo/rad-edge-accelerator.txt',
    sourceType: 'seed',
    summary:
      'Radiation-tolerant packaging option, 7 nm process node, and 112 Gbps PAM4 SerDes lanes.',
  },
  extractedSpecs: [
    {
      id: 'spec_1',
      canonicalFieldName: 'process_node',
      label: 'Process node',
      value: '7',
      unit: 'nm',
      sourceSnippet: 'Manufactured on a 7 nm process node',
      sourceText: 'Manufactured on a 7 nm process node',
      importance:
        'Process technology can matter when performance claims are compared to narrower semiconductor thresholds.',
      category: 'converter_performance',
      confidence: 'medium',
      valueType: 'directly_stated',
      reviewerStatus: 'unreviewed',
    },
    {
      id: 'spec_2',
      canonicalFieldName: 'serdes_rate',
      label: 'SerDes rate',
      value: '112',
      unit: 'Gbps',
      sourceSnippet: 'Supports 112 Gbps PAM4 SerDes lanes',
      sourceText: 'Supports 112 Gbps PAM4 SerDes lanes',
      importance:
        'High-speed interconnect claims are central to the first-pass Category 3 review.',
      category: 'digital_interface',
      confidence: 'medium',
      valueType: 'directly_stated',
      reviewerStatus: 'unreviewed',
    },
  ],
  factIssues: [],
  reviewPaths: [],
  eccnCandidates: [
    {
      id: 'cand_1',
      eccn: '3A001',
      title: 'Specified electronic items and components',
      officialTitle: 'Specified electronic items and components',
      status: 'review_required',
      confidence: 'medium',
      controlCriteria: ['High-speed interface performance comparison'],
      factMappings: [],
      matchedTechnicalFacts: [
        'process_node: 7 nm',
        'serdes_rate: 112 Gbps',
        'radiation_tolerance: present',
      ],
      regulatoryCitations: [
        {
          id: 'cit_1',
          citationLabel: 'CCL Category 3 electronics review',
          source: '15 CFR Supplement No. 1 to Part 774, Category 3',
          citationText:
            'Category 3 contains electronics review paths for certain high-performance components, interfaces, and related semiconductor items.',
          relevance:
            'The extracted interface and process facts justify a Category 3 review before using a broader fallback path.',
        },
      ],
      whyItMayApply:
        'The extracted semiconductor performance facts support a closer Category 3 review path.',
      whyItMayNotApply:
        'The current evidence still lacks precise threshold mapping to a narrower entry.',
      mayApplyReasons: ['High-speed interface evidence'],
      mayNotApplyReasons: ['Exact threshold mapping remains open'],
      missingInformation: [
        'Precise architecture and threshold mapping',
        'Supporting engineering clarification for specialized deployment claims',
      ],
      uncertaintyFlags: [
        'multiple_plausible_eccns',
        'requires_engineering_confirmation',
      ],
      reviewerQuestions: [
        'Which exact control-text threshold is the closest fit for these extracted facts?',
      ],
      alternativeCandidates: [],
      isSpecificEccn: true,
      confidenceRationale: 'Threshold mapping is incomplete, but the source-backed interface facts warrant a specific ECCN comparison.',
    },
  ],
  reviewMemo: {
    contentMarkdown:
      '# Draft ECCN Review Memo — Radiation-Tolerant Edge Accelerator Datasheet\n\n## 1. Document Summary\n- Title: Radiation-Tolerant Edge Accelerator Datasheet\n- Disclaimer: Draft for expert review only.',
  },
  reviewerActions: [],
  humanReviewStatus: 'pending_review',
  hasReviewerConclusion: false,
  humanReviews: [
    {
      id: 'review_1',
      status: 'pending_review',
      workflowState: 'awaiting_reviewer_assignment',
      reviewer: {
        name: 'Demo Reviewer',
      },
    },
  ],
};
