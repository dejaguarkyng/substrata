import type { Response } from 'express';
import { serialize } from 'cookie';
import { env } from '../config/env';

export const csrfCookieName = `${env.sessionCookieName}_csrf`;
export const oauthStateCookieName = `${env.sessionCookieName}_oauth_state`;
export const oauthVerifierCookieName = `${env.sessionCookieName}_oauth_verifier`;

function cookieOptions(httpOnly: boolean, maxAgeSeconds?: number) {
  return {
    httpOnly,
    sameSite: 'lax' as const,
    secure: env.isProduction,
    domain: env.isProduction ? '.junglegrid.dev' : undefined,
    path: '/',
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds } : {}),
  };
}

export function setSessionCookies(input: {
  res: Response;
  sessionToken: string;
  csrfToken: string;
}) {
  input.res.append(
    'Set-Cookie',
    serialize(
      env.sessionCookieName,
      input.sessionToken,
      cookieOptions(true, 14 * 24 * 60 * 60),
    ),
  );
  input.res.append(
    'Set-Cookie',
    serialize(
      csrfCookieName,
      input.csrfToken,
      cookieOptions(false, 14 * 24 * 60 * 60),
    ),
  );
}

export function clearSessionCookies(res: Response) {
  res.append(
    'Set-Cookie',
    serialize(env.sessionCookieName, '', {
      ...cookieOptions(true),
      expires: new Date(0),
    }),
  );
  res.append(
    'Set-Cookie',
    serialize(csrfCookieName, '', {
      ...cookieOptions(false),
      expires: new Date(0),
    }),
  );
}

export function setAnonymousCsrfCookie(res: Response, csrfToken: string) {
  res.append(
    'Set-Cookie',
    serialize(csrfCookieName, csrfToken, cookieOptions(false, 2 * 60 * 60)),
  );
}

export function setOAuthCookies(input: {
  res: Response;
  state: string;
  verifier: string;
}) {
  input.res.append(
    'Set-Cookie',
    serialize(oauthStateCookieName, input.state, cookieOptions(true, 10 * 60)),
  );
  input.res.append(
    'Set-Cookie',
    serialize(
      oauthVerifierCookieName,
      input.verifier,
      cookieOptions(true, 10 * 60),
    ),
  );
}

export function clearOAuthCookies(res: Response) {
  res.append(
    'Set-Cookie',
    serialize(oauthStateCookieName, '', {
      ...cookieOptions(true),
      expires: new Date(0),
    }),
  );
  res.append(
    'Set-Cookie',
    serialize(oauthVerifierCookieName, '', {
      ...cookieOptions(true),
      expires: new Date(0),
    }),
  );
}
