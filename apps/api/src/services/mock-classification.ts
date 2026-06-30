import type { WorkerOutput } from '@substrata/shared';

export function buildMockWorkerOutput(input: {
  documentId: string;
  organizationId: string;
  title: string;
  rawText?: string | null;
}): WorkerOutput {
  const text = input.rawText ?? '';
  const hasRadiation = /radiation|rad[- ]hard/i.test(text);
  const hasHighSpeed = /ghz|serdes|throughput|gops|tops/i.test(text);

  const uncertaintyFlags = [
    'multiple_plausible_eccns',
    hasRadiation ? 'requires_engineering_confirmation' : 'missing_key_specs',
  ] as const;

  return {
    documentId: input.documentId,
    organizationId: input.organizationId,
    requiresHumanReview: true,
    confidence: 0.61,
    confidenceRationale:
      'The sample output has enough source-backed technical facts to support review paths, but not enough threshold detail for a stronger recommendation.',
    uncertaintyFlags: [...uncertaintyFlags],
    extractedSpecs: [
      {
        name: 'process_node',
        displayName: 'Process node',
        value: '7',
        unit: 'nm',
        sourceSnippet: 'Manufactured on a 7 nm process node',
        sourceText: 'Manufactured on a 7 nm process node',
        importance:
          'Process technology can matter when a reviewer compares performance claims to controlled semiconductor thresholds.',
        category: 'converter_performance',
        confidence: 'medium',
        extractionRationale: 'Directly stated in the technical description.',
        valueType: 'directly_stated',
        extractionMethod: 'mock-classifier',
        extractionMethodVersion: 'v2',
      },
      {
        name: 'serdes_rate',
        displayName: 'SerDes rate',
        value: hasHighSpeed ? '112' : '56',
        unit: 'Gbps',
        sourceSnippet: hasHighSpeed
          ? 'Supports 112 Gbps PAM4 SerDes lanes'
          : 'Supports 56 Gbps serial interfaces',
        sourceText: hasHighSpeed
          ? 'Supports 112 Gbps PAM4 SerDes lanes'
          : 'Supports 56 Gbps serial interfaces',
        importance:
          'High-speed I/O claims are often the most concrete technical facts available in a first-pass ECCN review.',
        category: 'digital_interface',
        confidence: 'medium',
        extractionRationale: 'Directly stated in the sample source text.',
        valueType: 'directly_stated',
        extractionMethod: 'mock-classifier',
        extractionMethodVersion: 'v2',
      },
      {
        name: 'radiation_tolerance',
        displayName: 'Radiation tolerance',
        value: hasRadiation ? 'present' : 'not stated',
        unit: null,
        sourceSnippet: hasRadiation
          ? 'Radiation-tolerant packaging is referenced in the datasheet'
          : 'No explicit radiation-hardness statement found in the sample text',
        sourceText: hasRadiation
          ? 'Radiation-tolerant packaging is referenced in the datasheet'
          : 'No explicit radiation-hardness statement found in the sample text',
        importance:
          'Radiation-tolerance statements can materially change how a reviewer narrows plausible ECCN paths.',
        category: 'environmental_qualification',
        confidence: 'low',
        extractionRationale: hasRadiation
          ? 'Directly stated in the sample text.'
          : 'Absence was noted from the limited sample text and should be treated cautiously.',
        valueType: hasRadiation ? 'directly_stated' : 'inferred',
        extractionMethod: 'mock-classifier',
        extractionMethodVersion: 'v2',
      },
    ],
    factIssues: [],
    reviewPaths: [
      {
        pathKey: 'category_3_electronics_review',
        title: 'Category 3 electronics / processor review',
        scope: 'Evaluate whether the extracted semiconductor performance facts warrant Category 3 electronics comparison.',
        type: 'product_area',
        status: 'open',
        whyTriggered:
          'High-speed interface performance and advanced process-node facts were detected in the source-backed technical workup.',
        technicalRiskArea: 'Processor architecture and performance',
        triggeredFactNames: ['process_node', 'serdes_rate'],
        regulatoryCitations: [
          {
            citationLabel: 'CCL Category 3 electronics review',
            citationText:
              'Category 3 contains electronics review paths for certain high-performance components and related interfaces.',
            source: 'Category 3',
            relevance:
              'Connects the extracted performance signals to the initial Category 3 review path.',
            regulationSource: {
              authority: 'BIS / eCFR',
              regulationTitle: '15 CFR Part 774 Supplement No. 1, Category 3',
              regulationVersion: 'retrieved current',
              citationText:
                'Category 3 contains electronics review paths for certain high-performance components and related interfaces.',
              citationUrl: 'https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-774',
              sourceIdentifier: '15 CFR Part 774 Supp. No. 1 Category 3',
              section: 'Category 3',
              paragraph: null,
              kind: 'primary_regulation',
              verificationStatus: 'needs_verification',
            },
          },
        ],
        missingInformation: [
          'Precise architecture and control-text threshold mapping',
        ],
        reviewerQuestions: [
          'Which control-text threshold is the closest candidate fit for the extracted performance claims?',
        ],
      },
    ],
    eccnCandidates: [
      {
        eccn: '3A001',
        title: 'Electronics review path for high-performance components',
        officialTitle: 'Specified electronic items and components',
        confidence: hasHighSpeed ? 'medium' : 'low',
        confidenceRationale:
          'The sample source supports a specific ECCN comparison, but threshold mapping still requires qualified reviewer confirmation.',
        status: 'review_required',
        regulationSource: {
          authority: 'BIS / eCFR',
          regulationTitle: '15 CFR Part 774 Supplement No. 1, ECCN 3A001',
          regulationVersion: 'retrieved current',
          citationText:
            'Category 3 contains electronics review paths for certain high-performance components and related interfaces.',
          citationUrl: 'https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-774',
          sourceIdentifier: 'ECCN 3A001',
          section: 'Category 3',
          paragraph: null,
          kind: 'primary_regulation',
          verificationStatus: 'needs_verification',
        },
        controlCriteria: ['High-speed semiconductor interface comparison'],
        factMappings: [
          {
            factName: 'serdes_rate',
            criterionLabel: 'Interface throughput',
            matchedValue: hasHighSpeed ? '112 Gbps' : '56 Gbps',
            comparisonResult: 'Performance signals warrant review',
          },
        ],
        matchedTechnicalFacts: [
          'process_node: 7 nm',
          hasHighSpeed
            ? 'serdes_rate: 112 Gbps'
            : 'serdes_rate: 56 Gbps',
          `radiation_tolerance: ${hasRadiation ? 'present' : 'not stated'}`,
        ],
        whyItMayApply:
          'The extracted performance signals support a closer Category 3 electronics review path.',
        whyItMayNotApply:
          'The current text leaves threshold mapping to a qualified reviewer before narrowing the review path.',
        mayApplyReasons: ['High-speed performance facts were extracted from the source text.'],
        mayNotApplyReasons: ['Precise threshold mapping remains incomplete.'],
        missingInformation: [
          'Precise architecture and control-text threshold mapping',
          'Supporting engineering clarification for any specialized deployment statements',
        ],
        uncertaintyFlags: [...uncertaintyFlags],
        reviewerQuestions: [
          'Which control-text threshold is the closest candidate fit for the extracted performance claims?',
        ],
        alternativeCandidates: [],
        reviewPathKey: 'category_3_electronics_review',
      },
    ],
    memoMarkdown: `# Draft review memo — ${input.title}\n\n## 1. Executive summary\n- Product: ${input.title}\n- Review state: Draft generated\n- Reviewer conclusion: No reviewer conclusion recorded\n- Disclaimer: Classification support, not legal advice. Requires qualified reviewer confirmation.\n\n## 2. Source-document register\n- Source document: ${input.title}\n\n## 3. Material technical facts\n- Process node: 7 nm\n- Serial interface performance: ${hasHighSpeed ? '112 Gbps' : '56 Gbps'}\n- Radiation tolerance statement: ${hasRadiation ? 'present' : 'not stated'}\n\n## 4. Open information and contradictions\n- Precise architecture and control-text threshold mapping remains open.\n\n## 5. Review-path analysis\n- Category 3 electronics / processor review remains open pending qualified reviewer confirmation.\n\n## 6. ECCN candidate analysis\n- Potential ECCN candidate: 3A001, subject to current regulation mapping and reviewer confirmation.\n\n## 7. Reviewer conclusion\n- No reviewer conclusion recorded.\n\n## 8. Audit history\n- Draft memo generated from source-backed technical facts.`,
    artifacts: {
      extractedTextPath: `artifacts/${input.documentId}/extracted-text.txt`,
      structuredOutputPath: `artifacts/${input.documentId}/classification-output.json`,
      memoPath: `artifacts/${input.documentId}/memo.md`,
    },
  };
}
