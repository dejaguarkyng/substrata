import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicClassificationRunDemo, publicDemoCtaLinks } from './public-classification-run-demo';
import type { PublicClassificationRunRecord } from '../lib/types';

const demoRun: PublicClassificationRunRecord = {
  id: 'cmqj7n97d003vmw10si9skovh',
  status: 'completed',
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
      name: 'process_node',
      value: '7',
      unit: 'nm',
      sourceSnippet: 'Manufactured on a 7 nm process node.',
      importance: 'process threshold review',
      category: 'semiconductor_process',
      confidence: 'medium',
    },
  ],
  eccnCandidates: [
    {
      id: 'cand_1',
      eccn: '3A001',
      title: 'Specified electronic items and components',
      confidence: 'medium',
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
      missingInformation: ['Precise threshold mapping'],
      uncertaintyFlags: ['multiple_plausible_eccns'],
      reviewerQuestions: ['Which exact control-text threshold is the closest fit?'],
    },
  ],
  reviewMemo: {
    contentMarkdown: '# Draft memo\n\nPublic demo memo content.',
  },
  latestReview: {
    status: 'reviewed',
    notes: 'Engineering thresholds should be confirmed before internal adoption.',
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
