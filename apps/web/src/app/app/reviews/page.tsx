import Link from 'next/link';
import { AppShell } from '../../../components/app-shell';
import { ActionLink, EmptyState, Panel, StatusBadge, TableContainer } from '../../../components/ui';
import { requireCompletedOnboarding } from '../../../lib/server-auth';
import { fetchServerRuns } from '../../../lib/server-api';
import { formatDateTime } from '../../../lib/workspace';

export default async function ReviewsPage() {
  const session = await requireCompletedOnboarding('/app/reviews');
  const runs = await fetchServerRuns();

  return (
    <AppShell
      session={session}
      currentPath="/app/reviews"
      title="Classification reviews"
      description="Browse organization-scoped technical workups, review-path packages, memo status, reviewer state, and source-document context."
    >
      {runs.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          body="Upload a document and start a classification review to populate this workspace."
          action={<ActionLink href="/app/documents/new">Create first classification</ActionLink>}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:hidden">
            {runs.map((run) => (
              <Panel key={run.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/app/reviews/${run.id}`} className="block truncate font-medium text-slate-950">
                      {run.document.title}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{run.reviewPaths.length} review paths / {run.eccnCandidates.length} potential ECCN candidates</p>
                  </div>
                  <StatusBadge status={run.humanReviewStatus} />
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Reviewer</dt>
                    <dd className="mt-1 text-slate-700">{run.humanReviews[0]?.reviewer?.name ?? 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">Last updated</dt>
                    <dd className="mt-1 text-slate-700">{formatDateTime(run.completedAt ?? run.createdAt)}</dd>
                  </div>
                </dl>
              </Panel>
            ))}
          </div>
          <Panel className="hidden p-0 md:block">
            <TableContainer>
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Review</th>
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Reviewer</th>
                    <th className="px-4 py-3">Uncertainty</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="px-4 py-4">
                        <Link href={`/app/reviews/${run.id}`} className="font-medium text-slate-950">
                          Open review
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        <span className="block max-w-[18rem] truncate">{run.document.title}</span>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {run.humanReviews[0]?.reviewer?.name ?? 'Unassigned'}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {run.uncertaintyFlags.length > 0 ? `${run.uncertaintyFlags.length} flags` : 'No open flags'}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={run.humanReviewStatus} />
                      </td>
                      <td className="px-4 py-4 text-slate-600">{formatDateTime(run.completedAt ?? run.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
