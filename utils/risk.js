// utils/risk.js
// Risk is INVERSELY PROPORTIONAL to the distance between a debris particle and a
// critical satellite (the ISS):
//
//        risk % = GAIN * ( 1/(d + SOFTENING) - 1/(R + SOFTENING) )     clamped to 0..100
//
//   - 1/(d + SOFTENING): the inverse-distance term. SOFTENING keeps it finite at
//     d = 0 so risk climbs smoothly instead of slamming into the 100% cap.
//   - minus 1/(R + SOFTENING): shifts the curve so debris farther than R (the
//     THREAT RADIUS) from the ISS has exactly 0% risk. Without this, far-away
//     debris keeps a permanent risk "floor" and the Risk-O-Meter can never drop
//     low enough to win.
//   - GAIN scales the whole curve (difficulty knob).
//
// The Risk-O-Meter is the average risk of the METER_TOP_N most dangerous debris.

import { positionAtTime } from './orbit';

// Must match the ISS in OrbitalScene.jsx (which imports this object).
export const ISS_ORBIT = {
  id: 'iss',
  name: 'ISS Space Station',
  radius: 5.5,
  speed: 0.4,
  inclination: Math.PI / 6,
  axisAngle: 0,
  initialAngle: 0,
};

// Each debris is scored against its NEAREST satellite in this list.
// Add the weather sat / GPS here later.
export const CRITICAL_SATELLITES = [ISS_ORBIT];

export const RISK_CONFIG = {
  gain: 1000,             // bigger = riskier overall (harder game)
  softening: 5,           // bigger = flatter curve (less spiky when debris is very close)
  threatRadius: 13,       // debris farther than this from the ISS = 0% risk
  hysteresis: 8,          // a debris already in the top 5 keeps its slot unless
                          // an outsider beats it by more than this many % points
  nudgeRiskFactor: 0.15,  // every successful laser nudge multiplies that debris' risk by this (lower = stronger nudge)
// (a nudged debris stays safer even as it keeps orbiting)
  meterTopN: 10,          // Risk-O-Meter = average of the N riskiest debris
                          // (use Infinity for a plain average of ALL debris)
};

export function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Risk (0-100) from a raw distance: inverse-distance curve, 0% beyond threatRadius. */
export function riskFromDistance(distance, config = RISK_CONFIG) {
  const d = Math.max(distance, 0);
  const raw = 1 / (d + config.softening) - 1 / (config.threatRadius + config.softening);
  return Math.min(100, Math.max(0, config.gain * raw));
}

/** Risk of ONE debris at sim time t. Returns { risk, distance, satelliteId }. */
export function computeDebrisRisk(debris, t, satellites = CRITICAL_SATELLITES, config = RISK_CONFIG) {
  const debrisPos = positionAtTime(debris, t);

  let nearest = { distance: Infinity, satelliteId: null };
  for (const sat of satellites) {
    const d = distanceBetween(debrisPos, positionAtTime(sat, t));
    if (d < nearest.distance) nearest = { distance: d, satelliteId: sat.id };
  }

  return {
    risk: riskFromDistance(nearest.distance, config),
    distance: nearest.distance,
    satelliteId: nearest.satelliteId,
  };
}

/**
 * Scores every debris, flags the top-N, and returns the Risk-O-Meter value
 * (average risk of the config.meterTopN riskiest debris).
 *
 * `pressure` (0-100) is the "risk rises over time" mechanic. It closes that % of
 * the gap between each debris' risk and 100%, so values rise smoothly and stay
 * ordered instead of all clamping to 100%.
 */
export function assessDebrisField(debrisList, t, { pressure = 0, topN = 5, satellites, config = RISK_CONFIG } = {}) {
  const p = Math.min(100, Math.max(0, pressure)) / 100;

  const scored = debrisList.map((d) => {
    const { risk, distance, satelliteId } = computeDebrisRisk(d, t, satellites, config);
        const damped = risk * Math.pow(config.nudgeRiskFactor, d.nudges || 0); // laser-nudged debris is safer
    const total = 100 - (100 - damped) * (1 - p);
    return { ...d, riskPercentage: Math.round(total), distanceToTarget: distance, threatenedSatelliteId: satelliteId };
  });

  // Top-N with hysteresis: current top-N members get a small bonus when ranking,
  // so near-ties don't make the list flicker. Displayed percentages stay real.
  const ranked = [...scored].sort(
    (a, b) =>
      b.riskPercentage + (b.isHighRisk ? config.hysteresis : 0) -
      (a.riskPercentage + (a.isHighRisk ? config.hysteresis : 0))
  );
  const topIds = new Set(ranked.slice(0, topN).map((d) => d.id));
  const debris = scored.map((d) => ({ ...d, isHighRisk: topIds.has(d.id) }));

  // Risk-O-Meter: average risk of the N most dangerous debris (all of them if fewer).
  const meterSet = [...debris].sort((a, b) => b.riskPercentage - a.riskPercentage).slice(0, config.meterTopN);
  const threatLevel = meterSet.length
    ? Math.round(meterSet.reduce((sum, d) => sum + d.riskPercentage, 0) / meterSet.length)
    : 0;

  return { debris, threatLevel };
}