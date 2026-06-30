import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { ActionLink, EmptyState, Panel, StatusBadge } from '../../components/ui';
import { requireCompletedOnboarding } from '../../lib/server-auth';
import {
  fetchServerAuditLog,
  fetchServerDocuments,
  fetchServerReviewQueue,
} from '../../lib/server-api';
import { formatDateTime } from '../../lib/workspace';

export default async function AppOverviewPage() {
  const session = await requireCompletedOnboarding('/app');
  const [documents, reviewQueue, audit] = await Promise.all([
    fetchServerDocuments(),
    fetchServerReviewQueue(),
    fetchServerAuditLog(),
  ]);

  return (
    <AppShell
      session={session}
      currentPath="/app"
      title="Workspace overview"
      description="Track review-ready technical workups, review bottlenecks, reviewer actions, and recent audit activity from one operational surface."
      actions={
        <Link
          href="/app/documents/new"
          className="inline-flex items-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          New Classification
        </Link>
      }
    >
      {documents.length === 0 ? (
        <EmptyState
          title="Start your first classification review"
          body="Upload a technical document, extract source-backed technical facts, generate evidence-backed review paths, and prepare a reviewer-safe draft memo."
          action={<ActionLink href="/app/documents/new">Create first classification</ActionLink>}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-950">
                Reviews awaiting human decision
              </h2>
              <Link href="/app/review-queue" className="text-sm font-medium text-slate-700">
                Open queue
              </Link>
            </div>
            {reviewQueue.length === 0 ? (
              <EmptyState
                title="Nothing is waiting for review"
                body="Completed runs that still need a human decision will appear here."
              />
            ) : (
              <div className="mt-4 space-y-3">
                {reviewQueue.slice(0, 5).map((run) => (
                  <Link
                    key={run.id}
                    href={`/app/reviews/${run.id}`}
                    className="block rounded-lg border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-950">{run.document.title}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {run.reviewPaths.length} review paths / {run.uncertaintyFlags.length} uncertainty flags
                        </p>
                      </div>
                      <StatusBadge status={run.humanReviewStatus} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
          <div className="space-y-6">
            <Panel>
              <h2 className="text-lg font-semibold text-slate-950">Recently uploaded documents</h2>
              <div className="mt-4 space-y-3">
                {documents.slice(0, 5).map((document) => (
                  <Link
                    key={document.id}
                    href={`/app/documents/${document.id}`}
                    className="block rounded-lg border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <p className="truncate font-medium text-slate-950">{document.title}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{document.fileName}</p>
                  </Link>
                ))}
              </div>
            </Panel>
            {audit.events.length > 0 ? (
              <Panel>
                <h2 className="text-lg font-semibold text-slate-950">Recent activity</h2>
                <div className="mt-4 space-y-3">
                  {audit.events.slice(0, 6).map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 px-4 py-3">
                      <p className="font-medium text-slate-950">{event.action}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {event.actorUser?.name ?? event.actor} / {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      )}
    </AppShell>
  );
}
