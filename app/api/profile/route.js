// app/api/profile/route.js
// The ONLY place the player's points / cleared levels can change. The browser just stores the
// signed token it is handed (see store/useProfileStore.js) and sends it back with each request.
//
//   POST { action: 'verify',  token }                       -> check a saved token (tampered => level-1 reset)
//   POST { action: 'init' }                                 -> brand-new profile
//   POST { action: 'complete', token, level, debrisCleared } -> pay out a cleared level (first clear only)
//   POST { action: 'buyBomb',  token }                      -> spend BOMB_COST points
//
// NOTE: no `export const dynamic / runtime` here on purpose - next.config.mjs has
// `cacheComponents: true`, which rejects those route-segment options. POST handlers are never cached.

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { signProfile, verifyProfile } from '../../../lib/profileJwt';
import { MAX_LEVEL, BOMB_COST, getLevelConfig, pointsPerDebris } from '../../../utils/levels';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I look-alikes
const newPlayerId = () =>
  'OPS-' + Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');
const freshProfile = () => ({ pid: newPlayerId(), pts: 0, cl: [] });

/** The response body every action returns: the new signed token + the readable profile. */
function body(profile, extra = {}) {
  return {
    token: signProfile(profile),
    profile: { playerId: profile.pid, points: profile.pts, clearedLevels: profile.cl },
    ...extra,
  };
}

export async function POST(request) {
  const req = await request.json().catch(() => ({}));
  const { action, token } = req;

  if (action === 'init') return NextResponse.json(body(freshProfile()));

  const profile = verifyProfile(token);

  if (action === 'verify') {
    if (profile) return NextResponse.json(body(profile));
    // No token = first visit. A token that fails verification = somebody edited it => back to level 1.
    return NextResponse.json(body(freshProfile(), { reset: Boolean(token) }));
  }

  // Everything below needs a genuine token. A forged / edited one wipes the profile to level 1.
  if (!profile) {
    return NextResponse.json(body(freshProfile(), { reset: true, error: 'INVALID_TOKEN' }), { status: 401 });
  }

  if (action === 'complete') {
    const level = Number(req.level);
    if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
      return NextResponse.json({ error: 'BAD_LEVEL' }, { status: 400 });
    }
    const highest = profile.cl.length ? Math.max(...profile.cl) : 0;
    if (level > highest + 1) {
      // Claiming a level that was never unlocked: treat it as tampering.
      return NextResponse.json(body(freshProfile(), { reset: true, error: 'LEVEL_LOCKED' }), { status: 403 });
    }
    if (profile.cl.includes(level)) {
      return NextResponse.json(body(profile, { award: { level, points: 0, repeat: true } }));
    }
    // The server cannot see the game, so it caps the claim at what the level could possibly hold.
    const cleared = Math.min(getLevelConfig(level).debrisCount, Math.max(0, Math.floor(Number(req.debrisCleared) || 0)));
    const perDebris = pointsPerDebris(level);
    const earned = cleared * perDebris;
    const next = { ...profile, pts: profile.pts + earned, cl: [...profile.cl, level].sort((a, b) => a - b) };
    return NextResponse.json(
      body(next, { award: { level, points: earned, debrisCleared: cleared, perDebris, repeat: false } })
    );
  }

  if (action === 'buyBomb') {
    if (profile.pts < BOMB_COST) {
      return NextResponse.json(body(profile, { error: 'INSUFFICIENT_POINTS' }), { status: 402 });
    }
    return NextResponse.json(body({ ...profile, pts: profile.pts - BOMB_COST }));
  }

  return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
