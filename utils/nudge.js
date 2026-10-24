// utils/nudge.js
// Laser nudge: push a debris in the DIRECTION THE LASER WAS FIRED, towards a safer zone.
//
// When the laser's world-space direction (the raycast) is known, only moves that carry
// the debris roughly along that direction are considered, and of those the one that
// leaves the debris least dangerous to the ISS wins. If none of them is safer, the
// nudge is refused (null) rather than pushing the debris somewhere the laser did not
// point. Without a direction it falls back to the original "any safer move" search.
//
// A debris moves on a circular orbit described by (radius, initialAngle, ...).
// A laser can change two things:
//   - RADIUS  (+/- step)               -> a higher or lower orbit
//   - PHASE   (+/- step along orbit)   -> slide forward / backward along its orbit
// We try every combination of those, simulate where the debris AND the ISS will be
// over the next few seconds, and keep the combination that leaves the debris least
// dangerous to the ISS. So the nudge always pushes it away from the ISS, whichever
// side of the ISS it is on (instead of always "outwards").

import { positionAtTime, orbitalPosition } from './orbit';
import { CRITICAL_SATELLITES, RISK_CONFIG, distanceBetween, riskFromDistance } from './risk';

export const NUDGE_CONFIG = {
  step: 5.0,        // how far one nudge moves the debris (scene units) - bigger = stronger laser
  minRadius: 3.5,   // never nudge into Earth (Earth radius 2.8 + margin)
  earthClearance: 3.3, // the straight path to the new spot must stay at least this far from Earth's centre
  maxRadius: 13,    // never nudge out of the play area
  horizon: 40,      // look this many SIM seconds ahead when judging a nudge
  sampleEvery: 1,   // sampling step for that look-ahead (sim seconds)

  // --- laser-direction steering ---
  minAlignment: 0.25,        // cos(angle) between actual movement and laser direction (0.25 = within ~75 deg)
  minPlanarComponent: 0.3,   // laser must have at least this much of its direction inside the debris' orbital plane
  coneOffsetsDeg: [-60, -30, 0, 30, 60], // fan of push directions around the laser's in-plane direction
  magnitudes: [0.5, 1, 1.5], // push strength as multiples of `step`
};

// --- tiny vec3 helpers -------------------------------------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const norm = (a) => { const l = len(a); return l > 1e-9 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 }; };

/** Smallest distance from the origin (Earth's centre) to the segment a -> b. */
function minDistToOrigin(a, b) {
  const d = sub(b, a);
  const dd = dot(d, d);
  const t = dd < 1e-12 ? 0 : Math.min(1, Math.max(0, -dot(a, d) / dd));
  return len({ x: a.x + d.x * t, y: a.y + d.y * t, z: a.z + d.z * t });
}

/** Unit radial (away from Earth) and tangential (direction of travel) vectors of a debris at time t. */
function orbitBasis(body, t) {
  const angle = (body.initialAngle || 0) + body.speed * t;
  const p = orbitalPosition(body.radius, angle, body.inclination, body.axisAngle);
  const q = orbitalPosition(body.radius, angle + 0.01, body.inclination, body.axisAngle);
  const radial = norm(p);
  let tangent = sub(q, p);
  tangent = norm(sub(tangent, scale(radial, dot(tangent, radial)))); // make exactly perpendicular
  return { radial, tangent, position: p };
}

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

/** Candidate orbit changes that push along `aimDir` (null if the laser has no usable in-plane component). */
function directionalCandidates(debris, simTime, aimDir, cfg) {
  const { radial, tangent } = orbitBasis(debris, simTime);
  const a = dot(aimDir, radial);   // laser component along "up/down" (radius change)
  const b = dot(aimDir, tangent);  // laser component along the orbit (phase change)
  if (Math.hypot(a, b) < cfg.minPlanarComponent) return null; // laser is ~perpendicular to the orbit plane

  const base = Math.atan2(b, a); // push angle measured from radial towards tangent
  const out = [];
  for (const offDeg of cfg.coneOffsetsDeg) {
    const ang = base + (offDeg * Math.PI) / 180;
    for (const mag of cfg.magnitudes) {
      const radialDelta = Math.cos(ang) * cfg.step * mag;
      const tangentDelta = Math.sin(ang) * cfg.step * mag;
      out.push({
        radius: Math.min(cfg.maxRadius, Math.max(cfg.minRadius, debris.radius + radialDelta)),
        initialAngle: debris.initialAngle + tangentDelta / debris.radius, // arc length -> radians
      });
    }
  }
  return out;
}

/** The original 8-way search (used when no laser direction is known). */
function gridCandidates(debris, cfg) {
  const out = [];
  for (const radialMove of [-1, 0, 1]) {
    for (const phaseMove of [-1, 0, 1]) {
      if (radialMove === 0 && phaseMove === 0) continue;
      out.push({
        radius: Math.min(cfg.maxRadius, Math.max(cfg.minRadius, debris.radius + radialMove * cfg.step)),
        initialAngle: debris.initialAngle + (phaseMove * cfg.step) / debris.radius,
      });
    }
  }
  return out;
}

/**
 * Returns { radius, initialAngle } for the debris after a successful nudge, or
 * null if no option would help. Merge the result into the debris object.
 *
 * aimDir: optional world-space direction of the laser ({x,y,z}, need not be unit length).
 *         When given, the debris is only moved roughly along it.
 */
export function computeNudge(
  debris,
  simTime,
  aimDir = null,
  satellites = CRITICAL_SATELLITES,
  riskConfig = RISK_CONFIG,
  cfg = NUDGE_CONFIG
) {
  const before = futureThreat(debris, simTime, satellites, riskConfig, cfg);

  const dir = aimDir && len(aimDir) > 1e-9 ? norm(aimDir) : null;
  let candidates = dir ? directionalCandidates(debris, simTime, dir, cfg) : null;
  const steered = !!candidates;
  if (!candidates) candidates = gridCandidates(debris, cfg); // no/odd direction => old behaviour

  const from = positionAtTime(debris, simTime);

  let best = null;
  for (const { radius, initialAngle } of candidates) {
    const candidate = { ...debris, radius, initialAngle };

    const to = positionAtTime(candidate, simTime);
    const move = sub(to, from);

    // Rule: a debris can never be pushed close to the Earth - neither the new spot nor the
    // way there (a straight glide between two points can cut through the planet).
    if (minDistToOrigin(from, to) < cfg.earthClearance) continue;

    // Must really move along the laser (clamping / arc curvature can bend the move).
    if (steered && (len(move) < 1e-6 || dot(norm(move), dir) < cfg.minAlignment)) continue;

    const after = futureThreat(candidate, simTime, satellites, riskConfig, cfg);

    // Lower future risk wins; the tiny distance term breaks ties (e.g. when all
    // options are already 0% risk, prefer the one farthest from the ISS).
    const score = after.risk - 0.001 * after.distance;
    if (!best || score < best.score) best = { score, radius, initialAngle, risk: after.risk, distance: after.distance };
  }

  if (!best || best.risk > before.risk) return null; // nothing helps: leave it alone
  return { radius: best.radius, initialAngle: best.initialAngle };
}
