'use client';

import { signUpSchema, resetPasswordSchema } from '@substrata/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  fetchCsrfToken,
  forgotPassword,
  resendVerification,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
} from '../lib/api';
import { getSafeReturnPath } from '../lib/paths';
import { InlineNotice } from './ui';

// const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

function emailError(email: string) {
  if (!email) return 'Enter your work email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  return '';
}

function normalizeFieldMessage(field: string, message: string) {
  if (field === 'password' && message.includes('at least 12')) {
    return 'Use at least 12 characters.';
  }
  if (field === 'confirmPassword' && message.includes('Passwords do not match')) {
    return 'Passwords do not match.';
  }
  return message;
}

function Field({
  label,
  value,
  onChange,
  error,
  helper,
  type = 'text',
  autoComplete,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  type?: string;
  autoComplete?: string;
  children?: ReactNode;
}) {
  const id = useId();

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
          className={`w-full rounded-lg border bg-white px-3 py-2.5 pr-12 text-sm text-slate-950 outline-none transition focus:ring-2 ${
            error
              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
              : 'border-slate-300 focus:border-slate-950 focus:ring-slate-200'
          }`}
        />
        {children ? <div className="absolute inset-y-0 right-2 flex items-center">{children}</div> : null}
      </div>
      {helper && !error ? (
        <span id={`${id}-helper`} className="mt-2 block text-xs text-slate-500">
          {helper}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="mt-2 block text-xs text-rose-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function PasswordField(props: Omit<React.ComponentProps<typeof Field>, 'type' | 'children'>) {
  const [visible, setVisible] = useState(false);

  return (
    <Field {...props} type={visible ? 'text' : 'password'}>
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </Field>
  );
}

// function GoogleButton() {
//   return (
//     <a
//       href={`${API_BASE}/v1/auth/google/start`}
//       className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
//     >
//       Continue with Google
//     </a>
//   );
// }

// function AuthDivider() {
//   return (
//     <div className="flex items-center gap-3">
//       <div className="h-px flex-1 bg-slate-200" />
//       <span className="text-xs uppercase tracking-[0.18em] text-slate-400">or sign in with email</span>
//       <div className="h-px flex-1 bg-slate-200" />
//     </div>
//   );
// }

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? undefined;
  const next = getSafeReturnPath(searchParams.get('next'));
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);

  const emailValidation = useMemo(() => emailError(email), [email]);
  const passwordValidation = useMemo(() => (!password ? 'Enter your password.' : ''), [password]);
  const canSubmit = !emailValidation && !passwordValidation && !pending;

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit) {
          setError(emailValidation || passwordValidation);
          return;
        }

        setPending(true);
        setError('');
        setRequiresVerification(false);
        try {
          const csrfToken = await fetchCsrfToken();
          const result = await signIn({
            email,
            password,
            inviteToken,
            csrfToken,
          });
          router.replace(result.next === '/app' ? next : result.next);
          router.refresh();
        } catch (submissionError) {
          const message =
            submissionError instanceof Error ? submissionError.message : 'Sign-in failed.';
          if (message.includes('Verify your email')) {
            setRequiresVerification(true);
          }
          setError(
            message.includes('Invalid email or password')
              ? 'Incorrect email or password.'
              : message,
          );
        } finally {
          setPending(false);
        }
      }}
    >
      {/* <GoogleButton />
      // <AuthDivider /> */}
      <Field
        label="Work email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        error={email && emailValidation ? emailValidation : ''}
      />
      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        error={password && passwordValidation ? passwordValidation : ''}
      />
      {error ? (
        <InlineNotice tone={requiresVerification ? 'warning' : 'error'} title={requiresVerification ? 'Verification required' : undefined}>
          <p>{error}</p>
          {requiresVerification ? (
            <Link
              href={`/verify-email?email=${encodeURIComponent(email)}`}
              className="mt-2 inline-flex font-medium underline underline-offset-4"
            >
              Resend verification email
            </Link>
          ) : null}
        </InlineNotice>
      ) : null}
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <Link href="/forgot-password" className="hover:text-slate-950">
          Forgot password?
        </Link>
        <Link href="/sign-up" className="hover:text-slate-950">
          Create account
        </Link>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const fieldErrors = useMemo(() => {
    const result = signUpSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });
    if (result.success) {
      return {} as Record<string, string>;
    }

    return Object.fromEntries(
      result.error.issues.map((issue) => {
        const field = String(issue.path[0] ?? 'form');
        return [field, normalizeFieldMessage(field, issue.message)];
      }),
    );
  }, [confirmPassword, email, name, password]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (Object.keys(fieldErrors).length > 0) {
          setError('Review the highlighted fields and try again.');
          return;
        }

        setPending(true);
        setError('');
        try {
          const csrfToken = await fetchCsrfToken();
          await signUp({
            name,
            email,
            password,
            confirmPassword,
            csrfToken,
          });
          router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        } catch (submissionError) {
          setError(
            submissionError instanceof Error ? submissionError.message : 'Sign-up failed.',
          );
        } finally {
          setPending(false);
        }
      }}
    >
      {/* <GoogleButton /> */}
      {/* <AuthDivider /> */}
      <Field
        label="Full name"
        value={name}
        onChange={setName}
        autoComplete="name"
        error={name ? fieldErrors.name : ''}
      />
      <Field
        label="Work email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        error={email ? fieldErrors.email : ''}
      />
      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        helper="Use at least 12 characters."
        error={password ? fieldErrors.password : ''}
      />
      <PasswordField
        label="Confirm password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        error={confirmPassword ? fieldErrors.confirmPassword : ''}
      />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Creating account...' : 'Create account'}
      </button>
      <p className="text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-slate-950">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function VerifyEmailCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email') ?? '';
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;
    async function run() {
      const currentToken = token;
      if (!currentToken) {
        return;
      }
      try {
        const csrfToken = await fetchCsrfToken();
        const result = await verifyEmail({
          token: currentToken,
          csrfToken,
        });
        if (!active) {
          return;
        }
        setSuccess('Email verified. Redirecting to your workspace.');
        router.replace(result.next);
        router.refresh();
      } catch (verificationError) {
        if (!active) {
          return;
        }
        setError(
          verificationError instanceof Error
            ? verificationError.message
            : 'Verification failed.',
        );
      } finally {
        if (active) {
          setPending(false);
        }
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, [router, token]);

  return (
    <div className="space-y-4">
      {token ? (
        <InlineNotice tone={error ? 'error' : pending ? 'info' : 'success'} title="Email verification">
          {pending ? 'Verifying your email and preparing a workspace session.' : error || success}
        </InlineNotice>
      ) : (
        <InlineNotice tone="default" title="Verification required">
          {email
            ? `Use the verification link sent to ${email}. If the message has not arrived, request a new link below.`
            : 'Use the verification link from your inbox. If it has expired, request a new link below.'}
        </InlineNotice>
      )}
      {!token ? <ResendVerificationForm defaultEmail={email} /> : null}
    </div>
  );
}

export function ResendVerificationForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const validation = emailError(email);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (validation) {
          setError(validation);
          return;
        }
        setPending(true);
        setMessage('');
        setError('');
        try {
          const csrfToken = await fetchCsrfToken();
          const result = await resendVerification({ email, csrfToken });
          setMessage(result.message);
        } catch (submissionError) {
          setError(
            submissionError instanceof Error
              ? submissionError.message
              : 'Could not resend verification email.',
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="Work email" type="email" value={email} onChange={setEmail} error={email ? validation : ''} />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
      <button
        type="submit"
        disabled={pending || Boolean(validation)}
        className="inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Sending...' : 'Resend verification'}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const validation = emailError(email);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (validation) {
          setError(validation);
          return;
        }
        setPending(true);
        setMessage('');
        setError('');
        try {
          const csrfToken = await fetchCsrfToken();
          const result = await forgotPassword({ email, csrfToken });
          setMessage(result.message);
        } catch (submissionError) {
          setError(
            submissionError instanceof Error
              ? submissionError.message
              : 'Reset request failed.',
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="Work email" type="email" value={email} onChange={setEmail} error={email ? validation : ''} />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
      <button
        type="submit"
        disabled={pending || Boolean(validation)}
        className="inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Sending...' : 'Send reset link'}
      </button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(false);

  const fieldErrors = useMemo(() => {
    const result = resetPasswordSchema.safeParse({
      token: token || 'placeholder',
      password,
      confirmPassword,
    });
    if (result.success) {
      return {} as Record<string, string>;
    }

    return Object.fromEntries(
      result.error.issues
        .filter((issue) => issue.path[0] !== 'token')
        .map((issue) => {
          const field = String(issue.path[0] ?? 'form');
          return [field, normalizeFieldMessage(field, issue.message)];
        }),
    );
  }, [confirmPassword, password, token]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!token) {
          setError('This reset link is missing or invalid.');
          return;
        }
        if (Object.keys(fieldErrors).length > 0) {
          setError('Review the highlighted fields and try again.');
          return;
        }
        setPending(true);
        setError('');
        setSuccess('');
        try {
          const csrfToken = await fetchCsrfToken();
          const result = await resetPassword({
            token,
            password,
            confirmPassword,
            csrfToken,
          });
          setSuccess(result.message);
          window.setTimeout(() => {
            router.replace('/sign-in');
          }, 800);
        } catch (submissionError) {
          setError(
            submissionError instanceof Error
              ? submissionError.message
              : 'Password reset failed.',
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <PasswordField
        label="New password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        helper="Use at least 12 characters."
        error={password ? fieldErrors.password : ''}
      />
      <PasswordField
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        error={confirmPassword ? fieldErrors.confirmPassword : ''}
      />
      {!token ? (
        <InlineNotice tone="error">
          The reset link is missing. Request a new reset email to continue.
        </InlineNotice>
      ) : null}
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}
      <button
        type="submit"
        disabled={pending || !token}
        className="inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Updating...' : 'Reset password'}
      </button>
    </form>
  );
}
