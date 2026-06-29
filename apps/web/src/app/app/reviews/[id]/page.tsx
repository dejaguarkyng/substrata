import Link from 'next/link';
import { AppShell } from '../../../../components/app-shell';
import { DemoPublicationControls } from '../../../../components/demo-publication-controls';
import { MarkdownRenderer } from '../../../../components/markdown-renderer';
import { ReviewActionForm } from '../../../../components/review-action-form';
import { Badge, EmptyState, InlineNotice, Panel, StatusBadge } from '../../../../components/ui';
import { requireCompletedOnboarding } from '../../../../lib/server-auth';
import {
  fetchServerDemoPublicationStatus,
  fetchServerRun,
} from '../../../../lib/server-api';
import { formatDateTime } from '../../../../lib/workspace';

function confidenceTone(value: string) {
  if (value === 'high') return 'success' as const;
  if (value === 'low') return 'warning' as const;
  return 'default' as const;
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireCompletedOnboarding(`/app/reviews/${id}`);
  const [run, demoStatus] = await Promise.all([
    fetchServerRun(id),
    (session.membership?.role === 'OWNER' || session.membership?.role === 'ADMIN'
      ? fetchServerDemoPublicationStatus(id).catch(() => null)
      : Promise.resolve(null)),
  ]);
  const latestReview = run.humanReviews[0];
  const canReview =
    session.membership?.role === 'OWNER' ||
    session.membership?.role === 'ADMIN' ||
    session.membership?.role === 'REVIEWER';

  return (
    <AppShell
      session={session}
      currentPath="/app/reviews"
      title="ECCN review analysis"
      description="Inspect extracted technical facts, recommended review paths, uncertainty, citations, and the human review-ready memo draft."
      actions={
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={latestReview?.status} />
          <Link
            href={`/app/documents/${run.document.id}`}
            className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Source document
          </Link>
        </div>
      }
    >
      <div className="grid gap-6 xl:h-[calc(100vh-13rem)] xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6 xl:min-h-0 xl:overflow-y-auto xl:pr-2">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Recommended review paths</h2>
                <p className="mt-2 text-sm text-slate-600">
                  These are cited review paths for human review, not final determinations.
                </p>
              </div>
              <div className="text-sm text-slate-600">
                <p>Reviewer: {latestReview?.reviewer?.name ?? 'Unassigned'}</p>
                <p className="mt-1">Updated: {formatDateTime(latestReview?.reviewedAt ?? run.completedAt ?? run.createdAt)}</p>
              </div>
            </div>
            {run.eccnCandidates.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No recommended review paths yet"
                  body="This run has not produced a review-path package yet."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {run.eccnCandidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{candidate.eccn}</p>
                        <p className="mt-1 text-sm text-slate-600">{candidate.title}</p>
                      </div>
                      <Badge tone={confidenceTone(candidate.confidence)}>
                        {candidate.confidence} confidence
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {candidate.whyItMayApply}
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Why it may not apply
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {candidate.whyItMayNotApply}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Missing information
                        </p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                          {candidate.missingInformation.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    {candidate.regulatoryCitations.length > 0 ? (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Citations
                        </p>
                        <div className="mt-2 space-y-3">
                          {candidate.regulatoryCitations.map((citation) => (
                            <div key={citation.id ?? citation.citationLabel} className="rounded-lg bg-slate-50 p-3">
                              <p className="text-sm font-medium text-slate-950">{citation.citationLabel}</p>
                              <p className="mt-1 text-sm text-slate-600">{citation.citationText}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {citation.source} / {citation.relevance}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <h2 className="text-lg font-semibold text-slate-950">Extracted technical facts</h2>
            {run.extractedSpecs.length === 0 ? (
              <EmptyState
                title="No extracted facts available"
                body="The current run has not produced extracted technical facts yet."
              />
            ) : (
              <div className="mt-4 space-y-3">
                {run.extractedSpecs.map((spec) => (
                  <div key={spec.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium capitalize text-slate-950">
                        {spec.name.replace(/_/g, ' ')}
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
                    <p className="mt-2 text-sm text-slate-500">{spec.sourceSnippet}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="space-y-6 xl:min-h-0 xl:overflow-y-auto xl:pl-2">
          <Panel>
            {demoStatus ? (
              <div className="mb-6">
                <DemoPublicationControls
                  runId={run.id}
                  documentTitle={run.document.title}
                  documentFileName={run.document.fileName}
                  status={demoStatus}
                />
              </div>
            ) : null}

            <h2 className="text-lg font-semibold text-slate-950">Classification memo draft</h2>
            {run.reviewMemo?.contentMarkdown ? (
              <div className="mt-4 text-sm leading-7 text-slate-700">
                <MarkdownRenderer markdown={run.reviewMemo.contentMarkdown} />
              </div>
            ) : (
              <EmptyState
                title="Memo draft not available"
                body="Substrata has not generated a review-ready memo draft for this run yet."
              />
            )}
          </Panel>
          <Panel>
            <h2 className="text-lg font-semibold text-slate-950">Human review decision</h2>
            <p className="mt-2 text-sm text-slate-600">
              Record the reviewer disposition. Substrata keeps this as review-ready analysis rather than a final legal determination.
            </p>
            {run.uncertaintyFlags.length > 0 ? (
              <div className="mt-4">
                <InlineNotice tone="warning" title="Open uncertainty flags">
                  {run.uncertaintyFlags.join(', ').replace(/_/g, ' ')}
                </InlineNotice>
              </div>
            ) : null}
            <div className="mt-4">
              <ReviewActionForm
                runId={run.id}
                defaultStatus={
                  (latestReview?.status as
                    | 'pending_review'
                    | 'approved'
                    | 'needs_more_information'
                    | 'rejected') ?? 'pending_review'
                }
                defaultNote={latestReview?.notes}
                canReview={canReview}
              />
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
