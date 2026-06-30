'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { fetchCsrfToken, publishDemo, unpublishDemo } from '../lib/api';
import type { DemoPublicationStatusRecord } from '../lib/types';
import { ConfirmationDialog } from './confirmation-dialog';
import { Badge, InlineNotice } from './ui';

function buildAbsolutePublicUrl(canonicalUrl: string) {
  if (typeof window === 'undefined') {
    return canonicalUrl;
  }

  return new URL(canonicalUrl, window.location.origin).toString();
}

export function DemoPublicationControls({
  runId,
  documentTitle,
  documentFileName,
  status,
}: {
  runId: string;
  documentTitle: string;
  documentFileName: string;
  status: DemoPublicationStatusRecord;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [publishOpen, setPublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [publicTitle, setPublicTitle] = useState(status.publicTitle ?? documentTitle);
  const [publicSummary, setPublicSummary] = useState(status.publicSummary ?? '');
  const [sourceDocumentDisplayName, setSourceDocumentDisplayName] = useState(
    status.sourceDocumentDisplayName ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const publicUrl = buildAbsolutePublicUrl(status.canonicalUrl);

  async function withCsrf<T>(action: (csrfToken: string) => Promise<T>) {
    return action(await fetchCsrfToken());
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.isPublished ? 'success' : 'default'}>
          {status.isPublished ? 'Public demo live' : 'Private run'}
        </Badge>
        {status.willReplaceActiveDemo ? (
          <Badge tone="warning">Publishing will replace the current public demo</Badge>
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-950">Public demo controls</h2>
        <p className="text-sm leading-6 text-slate-600">
          Only cleared, publicly shareable documents should be published. Private runs stay behind
          the normal workspace authorization boundary.
        </p>
      </div>

      {status.isPublished ? (
        <InlineNotice tone="success" title="This run is live as the public demo">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={status.canonicalUrl}
              className="font-medium underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              {publicUrl}
            </a>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-white disabled:opacity-60"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl);
                  setMessage('Public demo link copied.');
                } catch {
                  setError('The public demo link could not be copied from this browser.');
                }
              }}
            >
              Copy link
            </button>
          </div>
        </InlineNotice>
      ) : null}

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!status.canPublish || isPending}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            setError(null);
            setMessage(null);
            setConfirmationChecked(false);
            setPublishOpen(true);
          }}
        >
          Publish as public demo
        </button>
        {status.isPublished ? (
          <button
            type="button"
            disabled={isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-300 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              setError(null);
              setMessage(null);
              setUnpublishOpen(true);
            }}
          >
            Unpublish demo
          </button>
        ) : null}
      </div>

      {!status.canPublish ? (
        <InlineNotice
          tone="warning"
          title={status.publishBlockTitle ?? 'Publication blocked'}
        >
          {status.publishBlockReason ??
            'Only completed runs with a generated classification memo draft can be published.'}
        </InlineNotice>
      ) : null}

      <ConfirmationDialog
        open={publishOpen}
        title="Publish this run as the public demo"
        description={
          status.willReplaceActiveDemo
            ? 'Publishing this run will replace the current public product demo.'
            : 'This will make the canonical classification-run URL viewable without authentication.'
        }
        confirmLabel="Publish demo"
        pending={isPending}
        onClose={() => {
          if (!isPending) {
            setPublishOpen(false);
          }
        }}
        onConfirm={() => {
          if (!confirmationChecked) {
            setError('Public demo publication requires the sharing attestation.');
            return;
          }

          startTransition(async () => {
            try {
              await withCsrf((csrfToken) =>
                publishDemo({
                  runId,
                  confirmation: true,
                  publicTitle,
                  publicSummary,
                  sourceDocumentDisplayName,
                  csrfToken,
                }),
              );
              setPublishOpen(false);
              setMessage('The public demo is now live.');
              router.refresh();
            } catch (publishError) {
              setPublishOpen(false);
              setError(
                publishError instanceof Error
                  ? publishError.message
                  : 'The public demo could not be published.',
              );
            }
          });
        }}
      >
        <div className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-950">Public title</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
              value={publicTitle}
              onChange={(event) => setPublicTitle(event.target.value)}
              placeholder={documentTitle}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-950">Public summary</span>
            <textarea
              className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
              value={publicSummary}
              onChange={(event) => setPublicSummary(event.target.value)}
              placeholder="A short framing summary for public viewers."
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-950">
              Source document display name
            </span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
              value={sourceDocumentDisplayName}
              onChange={(event) => setSourceDocumentDisplayName(event.target.value)}
              placeholder={documentFileName}
            />
            <p className="text-xs leading-5 text-slate-500">
              Leave blank to keep the original document filename private.
            </p>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-300"
              checked={confirmationChecked}
              onChange={(event) => setConfirmationChecked(event.target.checked)}
            />
            <span className="text-sm leading-6 text-slate-700">
              I confirm this document and its classification output are approved for public sharing
              and contain no confidential, personal, customer, export-controlled, or sensitive
              information.
            </span>
          </label>
        </div>
      </ConfirmationDialog>

      <ConfirmationDialog
        open={unpublishOpen}
        title="Unpublish the public demo"
        description="This will remove unauthenticated access to the current canonical public demo URL."
        confirmLabel="Unpublish demo"
        tone="destructive"
        pending={isPending}
        onClose={() => {
          if (!isPending) {
            setUnpublishOpen(false);
          }
        }}
        onConfirm={() => {
          startTransition(async () => {
            try {
              await withCsrf((csrfToken) => unpublishDemo({ runId, csrfToken }));
              setUnpublishOpen(false);
              setMessage('The public demo has been unpublished.');
              router.refresh();
            } catch (unpublishError) {
              setUnpublishOpen(false);
              setError(
                unpublishError instanceof Error
                  ? unpublishError.message
                  : 'The public demo could not be unpublished.',
              );
            }
          });
        }}
      />
    </div>
  );
}
