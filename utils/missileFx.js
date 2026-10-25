// utils/missileFx.js
// Tiny event bridge between the game store (which decides the missile's fate) and the 3D scene
// (which draws the flight + explosion). Kept outside zustand on purpose, like utils/aim.js.

/** How long a missile takes to reach its target (seconds). The result is applied when it arrives. */
export const MISSILE_FLIGHT_SECONDS = 0.9;

const listeners = new Set();

/**
 * shot = { debrisId, outcome: 'SUCCESS' | 'HIT_FAILED' | 'MISS', flight, onImpact }
 * The scene calls shot.onImpact() the moment the missile arrives (or passes by, on a miss).
 */
export function onMissileShot(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Returns true if a scene is listening (i.e. it will animate the shot and call onImpact). */
export function emitMissileShot(shot) {
  listeners.forEach((fn) => fn(shot));
  return listeners.size > 0;
}

// ---- Bomb ------------------------------------------------------------------------------------
/** Bomb timeline (seconds): fly to the target area -> radiate from its three holes -> fragments fly out. */
export const BOMB_FLIGHT_SECONDS = 1.2;
export const BOMB_RADIATE_SECONDS = 0.6;
export const BOMB_FRAGMENT_SECONDS = 0.55;
export const BOMB_FRAGMENT_STAGGER = 0.1;
export const BOMB_TOTAL_SECONDS = BOMB_FLIGHT_SECONDS + BOMB_RADIATE_SECONDS + BOMB_FRAGMENT_SECONDS + 0.2 + 0.7;

const bombListeners = new Set();

/**
 * shot = { targetId, victimIds: [...], onVictim(id), onDone() }
 * The scene calls onVictim(id) when a fragment reaches that debris, and onDone() when the whole show is over.
 */
export function onBombShot(fn) {
  bombListeners.add(fn);
  return () => bombListeners.delete(fn);
}

export function emitBombShot(shot) {
  bombListeners.forEach((fn) => fn(shot));
  return bombListeners.size > 0;
}
