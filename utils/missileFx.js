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
