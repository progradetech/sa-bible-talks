import { createHash, randomBytes } from 'node:crypto';

export const TRUSTED_DEVICE_COOKIE = 'sabt-trusted-device';
export const TRUST_DAYS = 90;
const TRUST_SECONDS = TRUST_DAYS * 24 * 60 * 60;

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function trustCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: TRUST_SECONDS,
  };
}

export function trustExpiresAt(): Date {
  return new Date(Date.now() + TRUST_SECONDS * 1000);
}
