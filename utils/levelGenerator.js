// utils/levelGenerator.js
// Builds the debris field for a level from the digits of pi, then enforces the playability rules:
//   1. Minimum Proximity Padding : no debris spawns within 15 deg of a satellite on the same orbit layer
//   2. Minimum Time-To-Impact    : no debris can reach a satellite within the first 9 real seconds
//   3. Guaranteed Solvability    : permitted missiles >= number of critical (top-5) debris, and the
//                                  Risk-O-Meter starts inside a playable band
// Same level number => same field, every time (pi digits, no Math.random).

import { createPiReader } from './piSeeder';
import { positionAtTime } from './orbit';
import { CRITICAL_SATELLITES, assessDebrisField, distanceBetween } from './risk';
import { ALL_SATELLITES, SAT_CLEARANCE, snapRadius } from './satellites';
import {
  getLevelConfig,
  riskConfigFor,
  SIM_SPEED,
  MIN_PADDING_DEG,
  MIN_TTI_SECONDS,
  COLLISION_RADIUS,
  CRITICAL_COUNT,
  START_THREAT_MIN,
  START_THREAT_MAX,
} from './levels';

// Orbit radii for debris. Each band sits OUTSIDE the keep-out shell (SAT_CLEARANCE) of every satellite
// (ISS 5.5, Satellite 2 6.8, Hubble 8.2), so debris can never touch a satellite. Jitter is +/-0.1 and
// buildAttempt() snaps the final radius out of any shell as a safety net.
const ORBIT_BANDS = [4.6, 6.15, 7.5, 8.9, 9.8];
const RADIUS_JITTER = 0.2;
const LAYER_THICKNESS = 0.75; // |radius difference| below this = "same radius layer"
const TWO_PI = Math.PI * 2;
const MAX_SPAWN_TRIES = 30;
const MAX_RESEEDS = 40;

function angularSeparationDeg(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const mags = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  return (Math.acos(Math.min(1, Math.max(-1, dot / mags))) * 180) / Math.PI;
}

/** Rule 1: true if the debris spawns too close (in angle) to a satellite on the same layer. */
export function violatesPadding(debris, satellites = CRITICAL_SATELLITES) {
  const p = positionAtTime(debris, 0);
  return satellites.some((sat) => {
    if (Math.abs(debris.radius - sat.radius) >= LAYER_THICKNESS) return false;
    return angularSeparationDeg(p, positionAtTime(sat, 0)) < MIN_PADDING_DEG;
  });
}

/**
 * Rule 2: REAL seconds until this debris first comes within COLLISION_RADIUS of a satellite
 * (Infinity if it does not within `horizonSeconds`).
 */
export function timeToImpact(debris, satellites = CRITICAL_SATELLITES, horizonSeconds = 120) {
  const stepSim = 0.05;
  const horizonSim = horizonSeconds * SIM_SPEED;
  for (let t = 0; t <= horizonSim; t += stepSim) {
    const p = positionAtTime(debris, t);
    for (const sat of satellites) {
      if (distanceBetween(p, positionAtTime(sat, t)) < COLLISION_RADIUS) return t / SIM_SPEED;
    }
  }
  return Infinity;
}

function buildAttempt(level, cfg, salt) {
  const pi = createPiReader(level, salt);
  const debris = [];
  let spawnFailures = 0;

  for (let i = 0; i < cfg.debrisCount; i++) {
    const d = {
      id: `DEBRIS-${5000 + level * 100 + i}`,
      radius: snapRadius(ORBIT_BANDS[i % ORBIT_BANDS.length] + (pi.float(2) - 0.5) * RADIUS_JITTER),
      speed: (0.15 + pi.float(2) * 0.2) * (i % 2 === 0 ? 1 : -1) * cfg.speedMult,
      inclination: ((i % 5) - 2) * (Math.PI / 8),
      axisAngle: (i / cfg.debrisCount) * TWO_PI + pi.float(2) * 0.2,
      initialAngle: pi.float(3) * TWO_PI,
      size: 0.14 + pi.float(2) * 0.08,
      riskPercentage: 0,        // filled in by recalculateThreat()
      distanceToTarget: 0,
      nudges: 0,
      isHighRisk: false,
    };

    // Re-roll the spawn angle (next pi digits) until rules 1 and 2 both hold.
    let tries = 0;
    while ((violatesPadding(d) || timeToImpact(d) < MIN_TTI_SECONDS) && tries < MAX_SPAWN_TRIES) {
      d.initialAngle = pi.float(3) * TWO_PI;
      tries++;
    }
    if (tries >= MAX_SPAWN_TRIES) spawnFailures++;
    debris.push(d);
  }
  return { debris, spawnFailures };
}

/** Rule 3 + start-band check. Returns { ok, problems[], startThreat }. */
export function validateLevel(debris, cfg) {
  const problems = [];
  const { threatLevel } = assessDebrisField(debris, 0, { pressure: 0, config: riskConfigFor(cfg) });
  if (cfg.missiles < CRITICAL_COUNT) problems.push(`missiles (${cfg.missiles}) < critical debris (${CRITICAL_COUNT})`);
  if (threatLevel <= START_THREAT_MIN) problems.push(`start threat ${threatLevel}% is too low`);
  if (threatLevel >= START_THREAT_MAX) problems.push(`start threat ${threatLevel}% is too high`);
  if (debris.some((d) => violatesPadding(d))) problems.push('proximity padding violated');
  if (debris.some((d) => ALL_SATELLITES.some((s) => Math.abs(d.radius - s.radius) < SAT_CLEARANCE))) {
    problems.push('debris orbit overlaps a satellite orbit');
  }
  if (debris.some((d) => timeToImpact(d) < MIN_TTI_SECONDS)) problems.push('time-to-impact too short');
  return { ok: problems.length === 0, problems, startThreat: threatLevel };
}

/** The debris field for a level. Re-seeds (deterministically) until every rule passes. */
export function generateLevel(level) {
  const cfg = getLevelConfig(level);
  let last = null;
  for (let salt = 0; salt < MAX_RESEEDS; salt++) {
    const { debris } = buildAttempt(level, cfg, salt);
    const check = validateLevel(debris, cfg);
    last = { debris, cfg, salt, ...check };
    if (check.ok) return last;
  }
  return last; // should never happen; scripts/verify-levels.mjs would have flagged it
}
