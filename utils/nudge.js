// utils/nudge.js
// Laser nudge: push a debris AWAY FROM THE ISS.
//
// A debris moves on a circular orbit described by (radius, initialAngle, ...).
// A laser can change two things:
//   - RADIUS  (+/- step)               -> a higher or lower orbit
//   - PHASE   (+/- step along orbit)   -> slide forward / backward along its orbit
// We try every combination of those, simulate where the debris AND the ISS will be
// over the next few seconds, and keep the combination that leaves the debris least
// dangerous to the ISS. So the nudge always pushes it away from the ISS, whichever
// side of the ISS it is on (instead of always "outwards").

import { positionAtTime } from './orbit';
import { CRITICAL_SATELLITES, RISK_CONFIG, distanceBetween, riskFromDistance } from './risk';

export const NUDGE_CONFIG = {
  step: 5.0,        // how far one nudge moves the debris (scene units) - bigger = stronger laser
  minRadius: 3.5,   // never nudge into Earth (Earth radius 2.8 + margin)
  maxRadius: 13,    // never nudge out of the play area
  horizon: 40,      // look this many SIM seconds ahead when judging a nudge
  sampleEvery: 1,   // sampling step for that look-ahead (sim seconds)
};

/** Average distance / risk of a debris to its nearest satellite over the look-ahead. */
function futureThreat(body, t, satellites, riskConfig, cfg) {
  let riskSum = 0;
  let distSum = 0;
  let n = 0;
  for (let dt = 0; dt <= cfg.horizon; dt += cfg.sampleEvery) {
    const time = t + dt;
    const pos = positionAtTime(body, time);
    let nearest = Infinity;
    for (const sat of satellites) {
      nearest = Math.min(nearest, distanceBetween(pos, positionAtTime(sat, time)));
    }
    riskSum += riskFromDistance(nearest, riskConfig);
    distSum += nearest;
    n++;
  }
  return { risk: riskSum / n, distance: distSum / n };
}

/**
 * Returns { radius, initialAngle } for the debris after a successful nudge, or
 * null if no option would help. Merge the result into the debris object.
 */
export function computeNudge(
  debris,
  simTime,
  satellites = CRITICAL_SATELLITES,
  riskConfig = RISK_CONFIG,
  cfg = NUDGE_CONFIG
) {
  const before = futureThreat(debris, simTime, satellites, riskConfig, cfg);

  let best = null;
  for (const radialMove of [-1, 0, 1]) {
    for (const phaseMove of [-1, 0, 1]) {
      if (radialMove === 0 && phaseMove === 0) continue;

      const radius = Math.min(cfg.maxRadius, Math.max(cfg.minRadius, debris.radius + radialMove * cfg.step));
      const initialAngle = debris.initialAngle + (phaseMove * cfg.step) / debris.radius; // arc length -> radians
      const candidate = { ...debris, radius, initialAngle };
      const after = futureThreat(candidate, simTime, satellites, riskConfig, cfg);

      // Lower future risk wins; the tiny distance term breaks ties (e.g. when all
      // options are already 0% risk, prefer the one farthest from the ISS).
      const score = after.risk - 0.001 * after.distance;
      if (!best || score < best.score) best = { score, radius, initialAngle, risk: after.risk, distance: after.distance };
    }
  }

  if (!best || best.risk > before.risk) return null; // nothing helps: leave it alone
  return { radius: best.radius, initialAngle: best.initialAngle };
}