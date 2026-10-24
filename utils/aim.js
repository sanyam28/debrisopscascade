// utils/aim.js
// Tiny pure-JS holder for "which way is the laser pointing".
// - Clicking an already-selected debris passes the exact raycast direction (e.ray.direction).
// - Button / keyboard fire has no ray, so the selected debris keeps this up to date
//   with the camera -> debris direction every frame, and fireLaser reads it.
// Kept outside the zustand store on purpose: it changes every frame and nobody
// needs to re-render because of it.

// Game rule: the Earth blocks the laser. A debris hidden behind the planet (as seen from
// the camera) cannot be shot. Must match Earth.jsx (diameter 5.6 => radius 2.8).
export const EARTH_RADIUS = 2.8;

const aim = { dir: null, blocked: false, screen: null };
const shotListeners = new Set();

/** true if the segment camera -> target passes through the Earth sphere (centre at origin). */
export function isOccludedByEarth(cameraPos, targetPos, earthRadius = EARTH_RADIUS) {
  const d = { x: targetPos.x - cameraPos.x, y: targetPos.y - cameraPos.y, z: targetPos.z - cameraPos.z };
  const dd = d.x * d.x + d.y * d.y + d.z * d.z;
  if (dd < 1e-12) return false;
  // closest point of the segment to the origin
  let t = -(cameraPos.x * d.x + cameraPos.y * d.y + cameraPos.z * d.z) / dd;
  t = Math.min(1, Math.max(0, t));
  const cx = cameraPos.x + d.x * t, cy = cameraPos.y + d.y * t, cz = cameraPos.z + d.z * t;
  return cx * cx + cy * cy + cz * cz < earthRadius * earthRadius;
}

/** Set from any world-space vector-like {x,y,z} (normalised here). */
export function setAimDirection(v) {
  if (!v) { aim.dir = null; aim.blocked = false; return; }
  const len = Math.hypot(v.x, v.y, v.z);
  aim.dir = len > 1e-9 ? { x: v.x / len, y: v.y / len, z: v.z / len } : null;
}

/** Direction from the camera towards a target point. */
export function setAimFromCamera(cameraPos, targetPos) {
  aim.blocked = isOccludedByEarth(cameraPos, targetPos);
  setAimDirection({ x: targetPos.x - cameraPos.x, y: targetPos.y - cameraPos.y, z: targetPos.z - cameraPos.z });
}

/** true while the selected debris is hidden behind the Earth (no line of sight). */
export function isAimBlocked() {
  return aim.blocked;
}

export function getAimDirection() {
  return aim.dir;
}

/** true if v looks like a {x,y,z} direction (rejects DOM/React events passed by accident). */
export function isDirection(v) {
  return !!v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';
}

/** Pixel position of the selected debris inside the canvas ({x, y, w, h, visible}) - used to draw the beam. */
export function setAimScreen(x, y, w, h, visible) {
  aim.screen = { x, y, w, h, visible };
}

export function getAimScreen() {
  return aim.screen;
}

/** The HUD subscribes here to flash a beam whenever the laser really fires. fn(outcome): 'SUCCESS' | 'HIT_FAILED' | 'MISS'. */
export function onLaserShot(fn) {
  shotListeners.add(fn);
  return () => shotListeners.delete(fn);
}

export function emitLaserShot(outcome) {
  shotListeners.forEach((fn) => fn(outcome));
}
