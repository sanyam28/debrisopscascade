// utils/orbit.js
// Pure-math orbit helpers (no three.js). Shared by the renderer AND the risk
// calculation so what you SEE on screen is exactly what the risk is computed from.

export function orbitalPosition(radius, angle, inclination = 0, axisAngle = 0) {
  // 1. circle in XZ plane
  const x0 = radius * Math.cos(angle);
  const y0 = 0;
  const z0 = radius * Math.sin(angle);

  // 2. rotate about X by inclination
  const ci = Math.cos(inclination);
  const si = Math.sin(inclination);
  const x1 = x0;
  const y1 = y0 * ci - z0 * si;
  const z1 = y0 * si + z0 * ci;

  // 3. rotate about Y by axisAngle
  const ca = Math.cos(axisAngle);
  const sa = Math.sin(axisAngle);
  return {
    x: x1 * ca + z1 * sa,
    y: y1,
    z: -x1 * sa + z1 * ca,
  };
}

/** Where an orbiting body is at simulation time t (seconds). */
export function positionAtTime(body, t) {
  const angle = (body.initialAngle || 0) + body.speed * t;
  return orbitalPosition(body.radius, angle, body.inclination, body.axisAngle);
}