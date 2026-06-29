import crypto from 'node:crypto';
import { parse } from 'cookie';
import { Router, type Request } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  profileUpdateSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from '@substrata/shared';
import { env } from '../config/env';
import {
  clearOAuthCookies,
  clearSessionCookies,
  csrfCookieName,
  oauthStateCookieName,
  oauthVerifierCookieName,
  setAnonymousCsrfCookie,
  setOAuthCookies,
  setSessionCookies,
} from '../lib/cookies';
import { HttpError } from '../lib/errors';
import { parseBody } from '../lib/http';
import { generateOpaqueToken, hashOpaqueToken } from '../lib/security';
import { requireAuth, requireCsrf } from '../middleware/auth';
import {
  acceptWorkspaceInvite,
  changePassword,
  getAuthMe,
  requestPasswordReset,
  revokeAllUserSessions,
  revokeSessionById,
  rotateSessionCsrf,
  signInWithGoogleProfile,
  signInWithPassword,
  signUpWithPassword,
  updateProfile,
  resetPassword,
} from '../services/auth.service';
import { assertRateLimit } from '../services/rate-limit.service';

export const authRouter = Router();

function getClientIp(req: Request) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    undefined
  );
}

function readCookies(header?: string) {
  return parse(header ?? '');
}

function createPkceChallenge(verifier: string) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

function assertGoogleState(
  cookies: Record<string, string | undefined>,
  state: string,
) {
  if (!state || cookies[oauthStateCookieName] !== state) {
    throw new HttpError(400, 'Google sign-in could not be verified.');
  }
}

async function exchangeGoogleCode(input: {
  code: string;
  verifier: string;
}) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleOAuthRedirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.verifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new HttpError(400, 'Google sign-in could not be completed.');
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token: string;
  };

  const userInfoResponse = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
    },
  );

  if (!userInfoResponse.ok) {
    throw new HttpError(400, 'Google sign-in could not be completed.');
  }

  return (await userInfoResponse.json()) as {
    email: string;
    email_verified: boolean;
    name: string;
    sub: string;
  };
}

function callbackRedirect(input: { status: 'success' | 'error'; next?: string; message?: string }) {
  const url = new URL(`${env.appUrl}/auth/callback`);
  url.searchParams.set('status', input.status);
  if (input.next) {
    url.searchParams.set('next', input.next);
  }
  if (input.message) {
    url.searchParams.set('message', input.message);
  }
  return url.toString();
}

authRouter.get('/csrf', (req, res) => {
  const cookies = readCookies(req.headers.cookie);
  const existing = cookies[csrfCookieName];
  const token = existing || generateOpaqueToken();
  if (!existing) {
    setAnonymousCsrfCookie(res, token);
  }
  res.json({ csrfToken: token });
});

authRouter.get('/me', async (req, res) => {
  const cookies = readCookies(req.headers.cookie);
  if (!req.authContext) {
    const csrfToken = cookies[csrfCookieName] || generateOpaqueToken();
    if (!cookies[csrfCookieName]) {
      setAnonymousCsrfCookie(res, csrfToken);
    }
    return res.json({
      authenticated: false,
      csrfToken,
    });
  }

  let csrfToken = cookies[csrfCookieName];
  if (
    !csrfToken ||
    req.authContext.session.csrfTokenHash !== hashOpaqueToken(csrfToken)
  ) {
    csrfToken = await rotateSessionCsrf(req.authContext.session.id);
    setAnonymousCsrfCookie(res, csrfToken);
  }

  return res.json({
    authenticated: true,
    csrfToken,
    ...(await getAuthMe(req.authContext.session)),
  });
});

authRouter.post('/sign-up', requireCsrf, async (req, res) => {
  const input = parseBody(signUpSchema, req);
  const ipAddress = getClientIp(req);
  assertRateLimit({
    key: `sign-up:${ipAddress}:${input.email.toLowerCase()}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });

  await signUpWithPassword(input);
  res.status(201).json({
    ok: true,
    message: 'Check your email for a verification link.',
  });
});

authRouter.post('/sign-in', requireCsrf, async (req, res) => {
  const input = parseBody(signInSchema, req);
  const ipAddress = getClientIp(req);
  assertRateLimit({
    key: `sign-in:${ipAddress}:${input.email.toLowerCase()}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  const result = await signInWithPassword({
    email: input.email,
    password: input.password,
    actor: {
      ipAddress,
      userAgent: req.get('user-agent'),
    },
  });

  setSessionCookies({
    res,
    sessionToken: result.session.rawSessionToken,
    csrfToken: result.session.rawCsrfToken,
  });

  if (input.inviteToken) {
    await acceptWorkspaceInvite({
      token: input.inviteToken,
      userId: result.user.id,
      sessionId: result.session.session.id,
    });
  }

  res.json({
    ok: true,
    next: result.user.onboardingCompletedAt ? '/app' : '/app/onboarding',
  });
});

authRouter.post('/sign-out', requireCsrf, requireAuth, async (req, res) => {
  await revokeSessionById(req.authContext!.session.id);
  clearSessionCookies(res);
  res.status(204).send();
});

authRouter.post('/verify-email', requireCsrf, async (req, res) => {
  const input = parseBody(verifyEmailSchema, req);
  const result = await verifyEmailToken({
    token: input.token,
    actor: {
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
    },
  });

  setSessionCookies({
    res,
    sessionToken: result.session.rawSessionToken,
    csrfToken: result.session.rawCsrfToken,
  });

  res.json({
    ok: true,
    next: result.user.onboardingCompletedAt ? '/app' : '/app/onboarding',
  });
});

authRouter.post('/resend-verification', requireCsrf, async (req, res) => {
  const input = parseBody(resendVerificationSchema, req);
  assertRateLimit({
    key: `resend-verification:${getClientIp(req)}:${input.email.toLowerCase()}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  await resendVerificationEmail(input.email);
  res.json({
    ok: true,
    message: 'If that email can receive verification mail, a new link has been sent.',
  });
});

authRouter.post('/forgot-password', requireCsrf, async (req, res) => {
  const input = parseBody(forgotPasswordSchema, req);
  assertRateLimit({
    key: `forgot-password:${getClientIp(req)}:${input.email.toLowerCase()}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  await requestPasswordReset(input.email);
  res.json({
    ok: true,
    message: 'If an account exists for that email, a reset link has been sent.',
  });
});

authRouter.post('/reset-password', requireCsrf, async (req, res) => {
  const input = parseBody(resetPasswordSchema, req);
  await resetPassword(input);
  res.json({
    ok: true,
    message: 'Your password has been reset.',
  });
});

authRouter.post(
  '/change-password',
  requireCsrf,
  requireAuth,
    async (req, res) => {
    const input = parseBody(changePasswordSchema, req);
    await changePassword({
      userId: req.authContext!.user.id,
      organizationId: req.authContext!.organization.id,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
    res.json({ ok: true });
  },
);

authRouter.patch(
  '/profile',
  requireCsrf,
  requireAuth,
    async (req, res) => {
    const input = parseBody(profileUpdateSchema, req);
    const user = await updateProfile({
      userId: req.authContext!.user.id,
      organizationId: req.authContext!.organization.id,
      name: input.name,
    });
    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    });
  },
);

authRouter.post(
  '/sessions/revoke-all',
  requireCsrf,
  requireAuth,
    async (req, res) => {
    await revokeAllUserSessions(req.authContext!.user.id);
    clearSessionCookies(res);
    res.json({ ok: true });
  },
);

authRouter.get('/google/start', async (req, res) => {
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new HttpError(503, 'Google sign-in is not configured.');
  }

  const state = generateOpaqueToken();
  const verifier = generateOpaqueToken();
  setOAuthCookies({
    res,
    state,
    verifier,
  });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.googleClientId);
  url.searchParams.set('redirect_uri', env.googleOAuthRedirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', createPkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');

  res.redirect(url.toString());
});

authRouter.get('/google/callback', async (req, res) => {
  assertRateLimit({
    key: `google-callback:${getClientIp(req)}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });

  try {
    const cookies = readCookies(req.headers.cookie);
    const code = req.query.code?.toString();
    const state = req.query.state?.toString() ?? '';
    if (!code) {
      throw new HttpError(400, 'Google sign-in could not be completed.');
    }

    assertGoogleState(cookies, state);
    const verifier = cookies[oauthVerifierCookieName];
    if (!verifier) {
      throw new HttpError(400, 'Google sign-in could not be verified.');
    }

    const profile = await exchangeGoogleCode({
      code,
      verifier,
    });

    const result = await signInWithGoogleProfile({
      email: profile.email,
      emailVerified: profile.email_verified,
      name: profile.name,
      providerAccountId: profile.sub,
      actor: {
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent'),
      },
    });

    clearOAuthCookies(res);
    setSessionCookies({
      res,
      sessionToken: result.session.rawSessionToken,
      csrfToken: result.session.rawCsrfToken,
    });

    res.redirect(
      callbackRedirect({
        status: 'success',
        next:
          result.created || !result.user.onboardingCompletedAt
            ? '/app/onboarding'
            : '/app',
      }),
    );
  } catch (error) {
    clearOAuthCookies(res);
    const message =
      error instanceof Error ? error.message : 'Google sign-in could not be completed.';
    res.redirect(
      callbackRedirect({
        status: 'error',
        next: '/sign-in',
        message,
      }),
    );
  }
});
