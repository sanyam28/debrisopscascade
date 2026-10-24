// utils/levels.js
// Single source of truth for difficulty. The store, the UI and the verifier all read this.

export const MAX_LEVEL = 15;

// Bomb power-up (from level 7): clears the BOMB_TARGETS debris closest to a satellite in one go.
export const BOMB_UNLOCK_LEVEL = 7;
export const BOMB_FREE_PER_LEVEL = 1;
export const BOMB_COST = 200;      // points for every extra bomb you buy (was 1000)
export const BOMB_TARGETS = 3;

// Slows EVERY orbiting body by running the shared sim clock slower (moved here from the store).
export const SIM_SPEED = 0.15;

// Playability rules (used by utils/levelGenerator.js)
export const MIN_PADDING_DEG = 15;   // no debris may spawn within 15 deg of a satellite on the same orbit layer
export const MIN_TTI_SECONDS = 9;    // every debris needs >= 9 real seconds before it can reach a satellite
export const COLLISION_RADIUS = 1.0; // "reaches a satellite" = comes closer than this (scene units)
export const CRITICAL_COUNT = 5;     // the top-N threats at level start
export const START_THREAT_MIN = 52;  // Risk-O-Meter must START inside this band, so a level is
export const START_THREAT_MAX = 85;  // neither already won (<=25) nor about to be lost (>=100)

import { RISK_CONFIG } from './risk';

/** The risk settings for a level: the base RISK_CONFIG plus this level's Risk-O-Meter window. */
export const riskConfigFor = (cfg) => ({ ...RISK_CONFIG, meterTopN: cfg.meterTopN });

// Level-1 and level-15 values; everything in between is interpolated.
const L1 = {
  missiles: 8,
  missileHitChance: 0.9,
  missileDestroyChance: 0.95,
  laserHitChance: 0.8,
  laserNudgeChance: 0.71,
  speedMult: 1,
};
const L15 = {
  missiles: 5,
  missileHitChance: 0.76,
  missileDestroyChance: 0.85,
  laserHitChance: 0.66,
  laserNudgeChance: 0.62,
  speedMult: 3.2,   // was 1.9 - debris at level 15 now moves 3.2x as fast as level 1
};

const lerp = (a, b, t) => a + (b - a) * t;
const round3 = (x) => Math.round(x * 1000) / 1000;

export function clampLevel(level) {
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1));
}

export function getLevelConfig(level) {
  const lvl = clampLevel(level);
  const t = (lvl - 1) / (MAX_LEVEL - 1); // 0 at level 1, 1 at level 15
  return {
    level: lvl,
    debrisCount: 25 + 4 * (lvl - 1),                     // +4 debris every level (25 -> 81)
    // The Risk-O-Meter averages the riskiest 40% of the field (10 debris at level 1, exactly as before).
    // A fixed top-10 can't work once the field grows: at 81 debris ~30 are "hot" and no player could clear them.
    meterTopN: Math.round(0.4 * (25 + 4 * (lvl - 1))),
    speedMult: round3(lerp(L1.speedMult, L15.speedMult, t)),
    bombs: lvl >= BOMB_UNLOCK_LEVEL ? BOMB_FREE_PER_LEVEL : 0, // free bombs this level
    missiles: Math.round(lerp(L1.missiles, L15.missiles, t)),
    missileHitChance: round3(lerp(L1.missileHitChance, L15.missileHitChance, t)),
    missileDestroyChance: round3(lerp(L1.missileDestroyChance, L15.missileDestroyChance, t)),
    laserHitChance: round3(lerp(L1.laserHitChance, L15.laserHitChance, t)),
    laserNudgeChance: round3(lerp(L1.laserNudgeChance, L15.laserNudgeChance, t)),
    // Passive risk growth per second. Inversely proportional to field size (0.10 at level 1, as before),
    // so the time budget PER DEBRIS stays constant. See the note in the README / verify script.
    pressurePerSecond: round3(2.5 / (25 + 4 * (lvl - 1))),
  };
}

/** Points PER DEBRIS destroyed: 10 on level 1, +5 for every level after that. */
export const POINTS_PER_DEBRIS_BASE = 10;
export const POINTS_PER_DEBRIS_STEP = 5;
export const pointsPerDebris = (level) => POINTS_PER_DEBRIS_BASE + POINTS_PER_DEBRIS_STEP * (level - 1);

/** A debris counts as CLEARED when it is destroyed (missile / bomb) OR successfully nudged by the laser.
 *  Each debris counts ONCE per run, so nudging the same one repeatedly can't farm points. */
export const NUDGE_COUNTS_AS_CLEARED = true;
/** What if the laser is fired at a debris and no safer orbit exists in the laser's direction?
 *  false = the shot is refused before firing: no beam, no cooldown spent, no Collision Window change. (current)
 *  true  = the shot is still fired (beam hits, notice says "NO SAFER ZONE"), cooldown is used. */
export const LASER_FIRES_WITHOUT_SAFE_ZONE = false;
/** true  = every victory pays (debris cleared x points per debris), replays included.
 *  false = only the first clear of a level pays (stops replay-farming). */
export const REPLAY_PAYS = true;
