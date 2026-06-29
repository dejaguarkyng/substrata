import React from 'react';
import type { PublicClassificationRunRecord } from '../lib/types';
import { buildApiUrl } from '../lib/api-base';
import { formatDateTime } from '../lib/workspace';
import { MemoDownloadLink } from './memo-download-link';
import { Badge, InlineNotice, Panel } from './ui';
import { MarkdownRenderer } from './markdown-renderer';

const signUpHref = '/sign-up?next=%2Fapp%2Fonboarding';
const signInHref = '/sign-in?next=%2Fapp%2Fonboarding';

export const publicDemoCtaLinks = {
  signUpHref,
  signInHref,
};

function confidenceTone(value: string) {
  if (value === 'high') return 'success' as const;
  if (value === 'low') return 'warning' as const;
  return 'default' as const;
}

function DemoCta() {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <a
        href={signUpHref}
        className="inline-flex min-h-10 items-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Run your own classification
      </a>
      <a
        href={signInHref}
        className="text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950"
      >
        Already have an account? Sign in
      </a>
    </div>
  );
}

function buildMemoFilename(run: PublicClassificationRunRecord) {
  const baseName = (run.sourceDocumentDisplayName ?? run.document.title ?? run.publicTitle)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `substrata-eccn-review-${baseName || run.id}.md`;
}

function buildPublicMemoDownloadHref(runId: string) {
  return buildApiUrl(`/v1/public/classification-runs/${runId}/memo/download`);
}

export function PublicClassificationRunDemo({
  run,
}: {
  run: PublicClassificationRunRecord;
}) {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-6 border-b border-slate-200 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <a href="/" className="flex items-center gap-3">
                <img
                  src="/brand/substrata-mark.png"
                  alt="Substrata mark"
                  className="h-9 w-9"
                />
                <div className="min-w-0">
                  <p className="text-base font-semibold tracking-tight text-slate-950">
                    Substrata
                  </p>
                  <p className="truncate text-xs uppercase tracking-[0.18em] text-slate-500">
                    ECCN review assistant
                  </p>
                </div>
              </a>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Badge tone="info">Public product demo</Badge>
                <Badge tone="default">{run.status}</Badge>
                {run.latestReview ? <Badge tone="success">Human-reviewed preview</Badge> : null}
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  {run.publicTitle}
                </h1>
                {run.reviewMemo?.contentMarkdown ? (
                  <div className="shrink-0">
                    <MemoDownloadLink
                      href={buildPublicMemoDownloadHref(run.id)}
                      filename={buildMemoFilename(run)}
                    />
                  </div>
                ) : null}
              </div>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
                {run.publicSummary ??
                  'A human-reviewed technical classification workup generated from a publicly available product datasheet.'}
              </p>
            </div>
            <div className="shrink-0">
              <DemoCta />
            </div>
          </div>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
            <Panel className="p-4 shadow-none">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Source document
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{run.document.title}</p>
              <p className="mt-1 text-sm text-slate-600">
                {run.sourceDocumentDisplayName ?? 'Public source document name withheld'}
              </p>
            </Panel>
            <Panel className="p-4 shadow-none">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Review paths
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{run.eccnCandidates.length}</p>
              <p className="mt-1 text-sm text-slate-600">Cited candidate classifications</p>
            </Panel>
            <Panel className="p-4 shadow-none">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Extracted facts
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{run.extractedSpecs.length}</p>
              <p className="mt-1 text-sm text-slate-600">Technical parameters tied to source evidence</p>
            </Panel>
            <Panel className="p-4 shadow-none">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Completed
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {formatDateTime(run.completedAt ?? run.createdAt)}
              </p>
              <p className="mt-1 text-sm text-slate-600">Review-ready memo available</p>
            </Panel>
          </div>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <Panel>
              <h2 className="text-lg font-semibold text-slate-950">Technical parameter extraction</h2>
              <p className="mt-2 text-sm text-slate-600">
                Extracted technical facts remain tied to the source datasheet evidence used in the workup.
              </p>
              <div className="mt-4 space-y-3">
                {run.extractedSpecs.map((spec) => (
                  <div key={spec.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium capitalize text-slate-950">
                        {spec.name.replaceAll('_', ' ')}
                      </p>
                      <Badge tone={confidenceTone(spec.confidence)}>{spec.confidence}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      {spec.value}
                      {spec.unit ? ` ${spec.unit}` : ''}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                      {spec.category} / {spec.importance}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{spec.sourceSnippet}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-lg font-semibold text-slate-950">Missing-information flags</h2>
              <p className="mt-2 text-sm text-slate-600">
                These are the open items a reviewer would still want clarified before adopting a final internal position.
              </p>
              <div className="mt-4 space-y-4">
                {run.eccnCandidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-lg border border-slate-200 p-4">
                    <p className="font-medium text-slate-950">
                      {candidate.eccn} / {candidate.title}
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                      {candidate.missingInformation.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel>
              <h2 className="text-lg font-semibold text-slate-950">Candidate classifications with citations</h2>
              <p className="mt-2 text-sm text-slate-600">
                Substrata presents cited review paths for human review, not final determinations.
              </p>
              <div className="mt-4 space-y-4">
                {run.eccnCandidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{candidate.eccn}</p>
                        <p className="mt-1 text-sm text-slate-600">{candidate.title}</p>
                      </div>
                      <Badge tone={confidenceTone(candidate.confidence)}>
                        {candidate.confidence} confidence
                      </Badge>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-700">{candidate.whyItMayApply}</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Why it may not apply
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {candidate.whyItMayNotApply}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Reviewer questions
                        </p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                          {candidate.reviewerQuestions.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Citations
                      </p>
                      <div className="mt-3 space-y-3">
                        {candidate.regulatoryCitations.map((citation) => (
                          <div key={citation.id ?? citation.citationLabel} className="rounded-lg bg-slate-50 p-3">
                            <p className="text-sm font-medium text-slate-950">{citation.citationLabel}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{citation.citationText}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {citation.source} / {citation.relevance}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-lg font-semibold text-slate-950">Uncertainty and reviewer notes</h2>
              {run.uncertaintyFlags.length > 0 ? (
                <InlineNotice tone="warning" title="Open uncertainty flags">
                  {run.uncertaintyFlags.join(', ').replaceAll('_', ' ')}
                </InlineNotice>
              ) : null}
              {run.latestReview?.notes ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Reviewer note
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{run.latestReview.notes}</p>
                </div>
              ) : null}
            </Panel>

            <Panel>
              <h2 className="text-lg font-semibold text-slate-950">Classification memo</h2>
              <div className="mt-4 text-sm leading-7 text-slate-700">
                {run.reviewMemo?.contentMarkdown ? (
                  <MarkdownRenderer markdown={run.reviewMemo.contentMarkdown} />
                ) : (
                  <p>No memo is available for this public demo run.</p>
                )}
              </div>
            </Panel>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Run your own classification
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Create an account to upload a product datasheet and prepare your own review-ready workup.
            </p>
            <div className="mt-5">
              <DemoCta />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
