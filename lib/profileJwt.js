// lib/profileJwt.js
// SERVER-ONLY. Signs and verifies the player's profile as an HS256 JWT, using Node's built-in
// crypto (no extra package). Imported only by app/api/profile/route.js - never from a component.
//
// A JWT is SIGNED, not hidden: anyone can read the points inside it, but nobody can change a
// single character without invalidating the signature, because only the server knows the secret.
// That is what stops the "edit localStorage and cheat" problem.

import crypto from 'node:crypto';
import { MAX_LEVEL } from '../utils/levels';

// Put a long random string in .env.local:   PROFILE_JWT_SECRET=...
// (generate one with:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
// Changing it invalidates every saved profile => every player restarts at level 1.
const SECRET = process.env.PROFILE_JWT_SECRET || 'dev-only-secret-set-PROFILE_JWT_SECRET-in-env-local';
if (!process.env.PROFILE_JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[profileJwt] PROFILE_JWT_SECRET is not set - anyone can forge profiles!');
}

const b64u = (value) => Buffer.from(value).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest();

/** profile = { pid: 'OPS-XXXXXX', pts: 0, cl: [1, 2, 3] }  ->  'header.payload.signature' */
export function signProfile(profile) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ ...profile, iat: Math.floor(Date.now() / 1000) }));
  const signature = b64u(hmac(`${header}.${payload}`));
  return `${header}.${payload}.${signature}`;
}

/** Returns the profile if the token is genuine and sane, otherwise null (=> treat as tampered). */
export function verifyProfile(token) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const given = Buffer.from(signature, 'base64url');
    const expected = hmac(`${header}.${payload}`);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    if (JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'HS256') return null;

    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const levelsOk =
      Array.isArray(p.cl) && p.cl.every((l) => Number.isInteger(l) && l >= 1 && l <= MAX_LEVEL);
    if (typeof p.pid !== 'string' || !Number.isInteger(p.pts) || p.pts < 0 || !levelsOk) return null;
    return { pid: p.pid, pts: p.pts, cl: p.cl };
  } catch {
    return null;
  }
}
