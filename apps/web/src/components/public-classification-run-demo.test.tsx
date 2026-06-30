import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicClassificationRunDemo, publicDemoCtaLinks } from './public-classification-run-demo';
import type { PublicClassificationRunRecord } from '../lib/types';

const demoRun: PublicClassificationRunRecord = {
  id: 'cmqj7n97d003vmw10si9skovh',
  status: 'completed',
  workflowState: 'reviewer_conclusion_recorded',
  workflowLabel: 'Human-reviewed',
  confidence: 0.64,
  uncertaintyFlags: ['multiple_plausible_eccns'],
  requiresHumanReview: true,
  publicTitle: 'Public accelerator classification workup',
  publicSummary:
    'A human-reviewed technical classification workup generated from a publicly available product datasheet.',
  sourceDocumentDisplayName: 'public-edge-accelerator.pdf',
  canonicalUrl: '/classification-runs/cmqj7n97d003vmw10si9skovh',
  publishedAt: '2026-06-20T08:15:00.000Z',
  createdAt: '2026-06-20T08:00:00.000Z',
  completedAt: '2026-06-20T08:05:00.000Z',
  demoBanner: 'Demo using publicly available technical documentation. Example technical workup, not a customer conclusion.',
  document: {
    title: 'Public edge accelerator datasheet',
    mimeType: 'application/pdf',
    sizeBytes: 128000,
    sourceType: 'seed',
    summary: 'A public hardware datasheet describing process node and interfaces.',
  },
  extractedSpecs: [
    {
      id: 'spec_1',
      canonicalFieldName: 'process_node',
      label: 'Process node',
      value: '7',
      unit: 'nm',
      sourceSnippet: 'Manufactured on a 7 nm process node.',
      sourceText: 'Manufactured on a 7 nm process node.',
      importance: 'process threshold review',
      category: 'semiconductor_process',
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
      confidenceRationale: 'Specific ECCN comparison is supported, but the threshold mapping remains open.',
      controlCriteria: ['Category 3 electronics threshold comparison'],
      factMappings: [],
      matchedTechnicalFacts: ['process_node: 7 nm'],
      regulatoryCitations: [
        {
          citationLabel: 'CCL Category 3',
          citationText: 'Category 3 contains electronics review paths.',
          source: '15 CFR Supplement No. 1 to Part 774, Category 3',
          relevance: 'Supports a Category 3 review path.',
        },
      ],
      whyItMayApply: 'The semiconductor performance facts support a Category 3 review.',
      whyItMayNotApply: 'The exact control threshold still needs reviewer mapping.',
      mayApplyReasons: ['Process-node evidence'],
      mayNotApplyReasons: ['Threshold mapping not yet confirmed'],
      missingInformation: ['Precise threshold mapping'],
      uncertaintyFlags: ['multiple_plausible_eccns'],
      reviewerQuestions: ['Which exact control-text threshold is the closest fit?'],
      alternativeCandidates: [],
      isSpecificEccn: true,
    },
  ],
  reviewMemo: {
    contentMarkdown: '# Draft memo\n\nPublic demo memo content.',
  },
  latestReview: {
    status: 'reviewed',
    workflowState: 'reviewer_conclusion_recorded',
    notes: 'Engineering thresholds should be confirmed before internal adoption.',
    conclusionRecordedAt: '2026-06-20T08:10:00.000Z',
    reviewedAt: '2026-06-20T08:10:00.000Z',
  },
};

test('public demo CTA links target onboarding sign-up and sign-in', () => {
  assert.equal(publicDemoCtaLinks.signUpHref, '/sign-up?next=%2Fapp%2Fonboarding');
  assert.equal(publicDemoCtaLinks.signInHref, '/sign-in?next=%2Fapp%2Fonboarding');
});

test('public demo page renders without auth/session controls', () => {
  const markup = renderToStaticMarkup(<PublicClassificationRunDemo run={demoRun} />);

  assert.match(markup, /Public product demo/);
  assert.match(markup, /Run your own classification/);
  assert.match(markup, /Already have an account\? Sign in/);
  assert.match(markup, /Download memo/);
  assert.match(
    markup,
    /A human-reviewed technical classification workup generated from a publicly available product datasheet\./,
  );
  assert.match(markup, /Public accelerator classification workup/);
  assert.doesNotMatch(markup, /Compliance workspace/);
  assert.doesNotMatch(markup, /Workspace Settings/);
  assert.doesNotMatch(markup, /Sign out/);
});
