'use client';

import { buildSignInHref, getSafeReturnPath } from './paths';
import type {
  AuditEventRecord,
  AuthSessionRecord,
  ClassificationRunRecord,
  DocumentRecord,
  InviteRecord,
  MembershipRecord,
  MemoListRecord,
  TeamMemberRecord,
} from './types';

const API_BASE = `${
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'
}/v1`;

function buildUrl(path: string) {
  return `${API_BASE}${path}`;
}

export class SessionExpiredError extends Error {
  readonly returnPath: string;

  constructor(returnPath: string) {
    super('Your session has expired. Redirecting to sign in.');
    this.name = 'SessionExpiredError';
    this.returnPath = returnPath;
  }
}

function currentBrowserReturnPath() {
  if (typeof window === 'undefined') {
    return '/app';
  }

  return getSafeReturnPath(
    `${window.location.pathname}${window.location.search}`,
    '/app',
  );
}

function redirectToSignIn(returnPath = currentBrowserReturnPath()) {
  if (typeof window === 'undefined') {
    return;
  }

  window.location.assign(buildSignInHref(returnPath));
}

async function readJsonError(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.message ?? payload?.error ?? 'Request did not complete.';
}

async function clientFetch<T>(
  path: string,
  init?: RequestInit & {
    csrfToken?: string;
    requiresAuth?: boolean;
  },
) {
  const headers = new Headers(init?.headers);
  if (init?.csrfToken) {
    headers.set('x-csrf-token', init.csrfToken);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && init?.requiresAuth) {
    const returnPath = currentBrowserReturnPath();
    redirectToSignIn(returnPath);
    throw new SessionExpiredError(returnPath);
  }

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function fetchCsrfToken() {
  const result = await clientFetch<{ csrfToken: string }>('/auth/csrf');
  return result.csrfToken;
}

export function fetchAuthSession() {
  return clientFetch<AuthSessionRecord>('/auth/me');
}

export function signUp(payload: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  csrfToken: string;
}) {
  return clientFetch<{ ok: true; message: string }>('/auth/sign-up', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function signIn(payload: {
  email: string;
  password: string;
  inviteToken?: string;
  csrfToken: string;
}) {
  return clientFetch<{ ok: true; next: string }>('/auth/sign-in', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function signOut(csrfToken: string) {
  return clientFetch('/auth/sign-out', {
    method: 'POST',
    csrfToken,
    requiresAuth: true,
  });
}

export function verifyEmail(payload: { token: string; csrfToken: string }) {
  return clientFetch<{ ok: true; next: string }>('/auth/verify-email', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: payload.token,
    }),
  });
}

export function resendVerification(payload: { email: string; csrfToken: string }) {
  return clientFetch<{ ok: true; message: string }>('/auth/resend-verification', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: payload.email }),
  });
}

export function forgotPassword(payload: { email: string; csrfToken: string }) {
  return clientFetch<{ ok: true; message: string }>('/auth/forgot-password', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: payload.email }),
  });
}

export function resetPassword(payload: {
  token: string;
  password: string;
  confirmPassword: string;
  csrfToken: string;
}) {
  return clientFetch<{ ok: true; message: string }>('/auth/reset-password', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function updateProfile(payload: {
  name: string;
  csrfToken: string;
}) {
  return clientFetch('/auth/profile', {
    method: 'PATCH',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: payload.name,
    }),
  });
}

export function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  csrfToken: string;
}) {
  return clientFetch('/auth/change-password', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function revokeAllSessions(csrfToken: string) {
  return clientFetch('/auth/sessions/revoke-all', {
    method: 'POST',
    csrfToken,
    requiresAuth: true,
  });
}

export function updateOnboarding(payload: {
  organizationName: string;
  industry?: string;
  csrfToken: string;
}) {
  return clientFetch('/organizations/current/onboarding', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function updateWorkspaceSettings(payload: {
  name: string;
  industry?: string;
  csrfToken: string;
}) {
  return clientFetch('/organizations/current', {
    method: 'PATCH',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function createDocumentFromText(payload: {
  title: string;
  fileName: string;
  rawText: string;
  csrfToken: string;
}) {
  return clientFetch<DocumentRecord>('/documents', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: payload.title,
      fileName: payload.fileName,
      mimeType: 'text/plain',
      sizeBytes: new TextEncoder().encode(payload.rawText).length,
      storagePath: `manual/${payload.fileName}`,
      rawText: payload.rawText,
      sourceType: 'manual',
    }),
  });
}

export function uploadDocument(payload: {
  title: string;
  rawText?: string;
  file: File;
  csrfToken: string;
}) {
  const form = new FormData();
  form.set('title', payload.title);
  if (payload.rawText) {
    form.set('rawText', payload.rawText);
  }
  form.set('file', payload.file);

  return clientFetch<DocumentRecord>('/documents/upload', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    body: form,
  });
}

export function createSampleDocument(csrfToken: string) {
  return clientFetch<DocumentRecord>('/documents/sample', {
    method: 'POST',
    csrfToken,
    requiresAuth: true,
  });
}

export function startClassificationRun(documentId: string, csrfToken: string) {
  return clientFetch<ClassificationRunRecord>(`/documents/${documentId}/classification-runs`, {
    method: 'POST',
    csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trigger: 'manual' }),
  });
}

export function submitReview(payload: {
  runId: string;
  status:
    | 'pending_review'
    | 'reviewed'
    | 'needs_more_information'
    | 'approved'
    | 'rejected';
  workflowState:
    | 'in_technical_review'
    | 'needs_additional_documentation'
    | 'escalated'
    | 'reviewer_conclusion_recorded'
    | 'approved_for_internal_use';
  note: string;
  approvalScope?: string;
  finalInternalRecommendation?: string;
  caveats?: string;
  assumptions?: string;
  missingInformation?: string;
  csrfToken: string;
}) {
  return clientFetch(`/classification-runs/${payload.runId}/review`, {
    method: 'POST',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: payload.status,
      workflowState: payload.workflowState,
      note: payload.note,
      approvalScope: payload.approvalScope ?? '',
      finalInternalRecommendation: payload.finalInternalRecommendation ?? '',
      caveats: payload.caveats ?? '',
      assumptions: payload.assumptions ?? '',
      missingInformation: payload.missingInformation ?? '',
    }),
  });
}

export function publishDemo(payload: {
  runId: string;
  confirmation: true;
  publicTitle?: string;
  publicSummary?: string;
  sourceDocumentDisplayName?: string;
  csrfToken: string;
}) {
  return clientFetch(`/classification-runs/${payload.runId}/publish-demo`, {
    method: 'POST',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      confirmation: payload.confirmation,
      publicTitle: payload.publicTitle ?? '',
      publicSummary: payload.publicSummary ?? '',
      sourceDocumentDisplayName: payload.sourceDocumentDisplayName ?? '',
    }),
  });
}

export function unpublishDemo(payload: { runId: string; csrfToken: string }) {
  return clientFetch(`/classification-runs/${payload.runId}/unpublish-demo`, {
    method: 'POST',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
  });
}

export function createInvite(payload: {
  email: string;
  role: MembershipRecord['role'];
  csrfToken: string;
}) {
  return clientFetch<{ invite: InviteRecord }>('/organizations/current/invites', {
    method: 'POST',
    csrfToken: payload.csrfToken,
    requiresAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: payload.email,
      role: payload.role,
    }),
  });
}

export function acceptInvite(payload: { token: string; csrfToken: string }) {
  return clientFetch<{ ok: true; organizationId: string }>(
    `/invites/${payload.token}/accept`,
    {
      method: 'POST',
      csrfToken: payload.csrfToken,
      requiresAuth: true,
    },
  );
}

export type {
  AuditEventRecord,
  AuthSessionRecord,
  ClassificationRunRecord,
  DocumentRecord,
  InviteRecord,
  MemoListRecord,
  TeamMemberRecord,
};
