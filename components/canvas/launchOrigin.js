// components/canvas/launchOrigin.js
// World-space point where missiles and bombs start: the laser-origin marker on screen
// (bottom centre), turned into a ray from the camera and followed a short way.

import * as THREE from 'three';
import { getLaserOrigin } from '../../utils/aim';

export const LAUNCH_DISTANCE = 4.5; // how far in front of the camera the projectile starts

export function getLaunchOrigin(camera) {
  const o = getLaserOrigin();
  const ndcX = o ? (o.x / o.w) * 2 - 1 : 0;
  const ndcY = o ? -(o.y / o.h) * 2 + 1 : -0.55; // fallback: bottom centre
  return new THREE.Vector3(ndcX, ndcY, 0.5)
    .unproject(camera)
    .sub(camera.position)
    .normalize()
    .multiplyScalar(LAUNCH_DISTANCE)
    .add(camera.position);
}
