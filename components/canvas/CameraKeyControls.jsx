'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCameraSettings } from '../../store/useCameraSettings';

// Steer the view with the keyboard (renders nothing). Must sit INSIDE <Canvas>.
//   A / D : orbit the camera left / right around the Earth
//   W / S : tilt the view up / down (over the poles)
// Mouse drag + wheel (OrbitControls) keep working alongside it.
// Speed per key = base speed x master sensitivity x that key's sensitivity (see components/ui/CameraSensitivity.jsx).
// If a direction feels backwards to you, flip the sign of YAW_SPEED or PITCH_SPEED.
const YAW_SPEED = 1.2;    // radians per second
const PITCH_SPEED = 1.0;  // radians per second
const MIN_PHI = 0.15;     // never go quite over the pole (the camera "up" vector would flip)
const MAX_PHI = Math.PI - 0.15;

const _sph = new THREE.Spherical();

export default function CameraKeyControls() {
  const keys = useRef({ KeyW: false, KeyA: false, KeyS: false, KeyD: false });

  useEffect(() => {
    const isTyping = (el) =>
      !!el && ((el.tagName === 'INPUT' && el.type !== 'range') || el.tagName === 'TEXTAREA' || el.isContentEditable); // sliders don't count as typing
    const onDown = (e) => {
      if (e.code in keys.current && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        keys.current[e.code] = true;
      }
    };
    const onUp = (e) => {
      if (e.code in keys.current) keys.current[e.code] = false;
    };
    const releaseAll = () => {
      for (const k in keys.current) keys.current[k] = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', releaseAll); // don't keep spinning after alt-tab
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, []);

  useFrame((state, delta) => {
    const k = keys.current;
    const { master, keys: sens } = useCameraSettings.getState();
    const yaw = (k.KeyD ? sens.KeyD : 0) - (k.KeyA ? sens.KeyA : 0);
    const pitch = (k.KeyW ? sens.KeyW : 0) - (k.KeyS ? sens.KeyS : 0);
    if (!yaw && !pitch) return;

    const dt = Math.min(delta, 0.1);
    const cam = state.camera;
    _sph.setFromVector3(cam.position);                 // camera position relative to the Earth (0,0,0)
    _sph.theta -= yaw * master * YAW_SPEED * dt;                // D: swing right
    _sph.phi = Math.min(MAX_PHI, Math.max(MIN_PHI, _sph.phi - pitch * master * PITCH_SPEED * dt)); // W: tilt up
    cam.position.setFromSpherical(_sph);
    cam.lookAt(0, 0, 0);
  });

  return null;
}
