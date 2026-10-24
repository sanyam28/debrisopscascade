// utils/satellites.js
// Single source of truth for EVERY satellite's orbit, plus the "keep-out shell" rule that
// stops debris from ever overlapping a satellite.
//
// WHY A RADIUS RULE: every orbit in this game is a circle around the Earth's centre, so a body
// is always exactly `radius` away from the centre. Two bodies can therefore never be closer than
// |radius_a - radius_b|, no matter their inclination, speed or phase. If every debris keeps
// |debris.radius - satellite.radius| >= SAT_CLEARANCE, the two can NEVER touch - at any time,
// before or after a laser nudge. No simulation / timing check is needed for that guarantee.

export const ISS_ORBIT = {
  id: 'iss',
  name: 'ISS Space Station',
  radius: 5.5,
  speed: 0.4,
  inclination: Math.PI / 6,
  axisAngle: 0,
  initialAngle: 0,
};

export const SAT2_ORBIT = {
  id: 'sat2',
  name: 'Satellite 2',
  radius: 6.8,
  speed: 0.3,
  inclination: -Math.PI / 4,
  axisAngle: Math.PI / 3,
  initialAngle: Math.PI / 2,
};

export const HUBBLE_ORBIT = {
  id: 'hubble',
  name: 'Hubble Space Telescope',
  radius: 8.2,
  speed: 0.2,
  inclination: Math.PI / 3,
  axisAngle: (2 * Math.PI) / 3,
  initialAngle: Math.PI,
};

/** Every satellite drawn in the scene (debris must keep clear of all of them). */
export const ALL_SATELLITES = [ISS_ORBIT, SAT2_ORBIT, HUBBLE_ORBIT];

/** Minimum centre-to-centre distance (scene units) between any debris and any satellite, always. */
export const SAT_CLEARANCE = 0.5;

const EPS = 0.01; // snap slightly outside the shell so rounding can never land on the edge

/** True if a debris on an orbit of this radius can never come within SAT_CLEARANCE of a satellite. */
export function isRadiusSafe(radius, satellites = ALL_SATELLITES, clearance = SAT_CLEARANCE) {
  return satellites.every((s) => Math.abs(radius - s.radius) >= clearance);
}

/**
 * The closest radius to `radius` that is outside every satellite's keep-out shell and inside
 * [minRadius, maxRadius]. Returns `radius` unchanged when it is already safe.
 */
export function snapRadius(radius, minRadius = 3.5, maxRadius = 13, satellites = ALL_SATELLITES, clearance = SAT_CLEARANCE) {
  const r = Math.min(maxRadius, Math.max(minRadius, radius));
  if (isRadiusSafe(r, satellites, clearance)) return r;

  const candidates = [];
  for (const s of satellites) {
    candidates.push(s.radius - clearance - EPS, s.radius + clearance + EPS);
  }
  let best = null;
  for (const c of candidates) {
    if (c < minRadius || c > maxRadius || !isRadiusSafe(c, satellites, clearance)) continue;
    if (best === null || Math.abs(c - r) < Math.abs(best - r)) best = c;
  }
  return best === null ? r : best; // (no free radius at all would be a config error)
}

/**
 * Last line of defence for the RENDERER: if a debris (e.g. mid-glide after a laser nudge) is
 * closer than `clearance` to a satellite's current position, push it straight out to the edge.
 * `pos` and each satellite position are {x,y,z}; `pos` is modified in place.
 */
export function pushOutOfSatellites(pos, satPositions, clearance = SAT_CLEARANCE) {
  for (const sp of satPositions) {
    const dx = pos.x - sp.x;
    const dy = pos.y - sp.y;
    const dz = pos.z - sp.z;
    const d = Math.hypot(dx, dy, dz);
    if (d >= clearance) continue;
    if (d < 1e-6) { pos.x = sp.x + clearance; continue; } // exactly on top: any direction will do
    const k = clearance / d;
    pos.x = sp.x + dx * k;
    pos.y = sp.y + dy * k;
    pos.z = sp.z + dz * k;
  }
}
