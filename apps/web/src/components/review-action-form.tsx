'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { fetchCsrfToken, submitReview } from '../lib/api';
import { ConfirmationDialog } from './confirmation-dialog';
import { InlineNotice } from './ui';

const reviewStatuses = [
  {
    value: 'pending_review',
    label: 'Awaiting reviewer',
    workflowState: 'in_technical_review',
  },
  {
    value: 'needs_more_information',
    label: 'Needs documentation',
    workflowState: 'needs_additional_documentation',
  },
  {
    value: 'reviewed',
    label: 'Conclusion recorded',
    workflowState: 'reviewer_conclusion_recorded',
  },
  {
    value: 'approved',
    label: 'Approved for internal use',
    workflowState: 'approved_for_internal_use',
  },
  {
    value: 'rejected',
    label: 'Escalated',
    workflowState: 'escalated',
  },
] as const;

type ReviewStatusValue = (typeof reviewStatuses)[number]['value'];

export function ReviewActionForm({
  runId,
  defaultStatus,
  defaultNote,
  defaultRecommendation,
  canReview,
}: {
  runId: string;
  defaultStatus: ReviewStatusValue;
  defaultNote?: string | null;
  defaultRecommendation?: string | null;
  canReview: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<ReviewStatusValue>(defaultStatus);
  const [note, setNote] = useState(defaultNote ?? '');
  const [recommendation, setRecommendation] = useState(defaultRecommendation ?? '');
  const [approvalScope, setApprovalScope] = useState('');
  const [caveats, setCaveats] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [missingInformation, setMissingInformation] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => reviewStatuses.find((option) => option.value === status) ?? reviewStatuses[0],
    [status],
  );

  if (!canReview) {
    return (
      <InlineNotice tone="warning" title="Reviewer access required">
        Only owners, admins, and reviewers can record reviewer conclusions and workflow actions.
      </InlineNotice>
    );
  }

  return (
    <div className="space-y-4">
      <label className="space-y-2">
        <span className="text-sm font-medium text-ink">Review state</span>
        <select
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
          value={status}
          onChange={(event) => setStatus(event.target.value as ReviewStatusValue)}
        >
          {reviewStatuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-ink">Reviewer notes</span>
        <textarea
          className="min-h-24 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Record reasoning, open reviewer questions, contradictions, or supporting evidence."
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-ink">Final internal recommendation</span>
        <textarea
          className="min-h-24 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          placeholder="Optional until a reviewer conclusion is recorded. Capture the internal recommendation that should appear in the memo."
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-ink">Approval scope</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
            value={approvalScope}
            onChange={(event) => setApprovalScope(event.target.value)}
            placeholder="Example: internal screening only"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-ink">Missing information</span>
          <input
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
            value={missingInformation}
            onChange={(event) => setMissingInformation(event.target.value)}
            placeholder="Ordering code, security manual, threshold mapping"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-ink">Caveats</span>
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
            value={caveats}
            onChange={(event) => setCaveats(event.target.value)}
            placeholder="Known limitations, open contradictions, or scope constraints."
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-ink">Assumptions</span>
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
            value={assumptions}
            onChange={(event) => setAssumptions(event.target.value)}
            placeholder="Family-level datasheet assumptions, public-document assumptions, or engineering assumptions."
          />
        </label>
      </div>

      <InlineNotice tone="default" title="Reviewer record">
        This records an authenticated reviewer action, updates workflow state, and preserves the audit trail. It does not present an automated legal determination.
      </InlineNotice>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}

      <button
        type="button"
        disabled={isPending}
        className="inline-flex items-center rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-steel disabled:opacity-50"
        onClick={() => {
          setError(null);
          setMessage(null);
          setConfirmOpen(true);
        }}
      >
        {isPending ? 'Saving reviewer action...' : 'Save reviewer action'}
      </button>

      <ConfirmationDialog
        open={confirmOpen}
        title={`Confirm: ${selected.label}`}
        description="This records a qualified reviewer action for the current run and updates the organization audit trail."
        confirmLabel="Record action"
        pending={isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            try {
              await submitReview({
                runId,
                status,
                workflowState: selected.workflowState,
                note,
                approvalScope,
                finalInternalRecommendation: recommendation,
                caveats,
                assumptions,
                missingInformation,
                csrfToken: await fetchCsrfToken(),
              });
              setConfirmOpen(false);
              setMessage('Reviewer action saved.');
              router.refresh();
            } catch (reviewError) {
              setConfirmOpen(false);
              setError(
                reviewError instanceof Error
                  ? reviewError.message
                  : 'Reviewer action was not saved.',
              );
            }
          });
        }}
      />
    </div>
  );
}
