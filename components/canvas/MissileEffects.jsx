'use client';

import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import { positionAtTime } from '../../utils/orbit';
import { onMissileShot } from '../../utils/missileFx';
import { getLaserOrigin } from '../../utils/aim';

// Draws every missile shot (must sit INSIDE <Canvas>):
//   1. a small missile flies from the LASER ORIGIN marker (same spot the laser starts from) to the target,
//   2. on a hit it explodes (small fireball + sparks) and disappears,
//   3. on a miss it sails past the target and disappears (no explosion).
// The game result is applied by the store when the missile ARRIVES (shot.onImpact).
//
// Put your model at  public/missile.glb . Until it exists a simple built-in missile is drawn instead.

const MODEL_URL = '/missile.glb';
const MISSILE_LENGTH = 0.42;     // longest side of the missile in scene units (debris are ~0.2 wide) - make smaller / bigger here
const MODEL_NOSE_IS_NEGATIVE = false; // set true if your model flies tail-first (nose points the other way along its long axis)
const EARTH_RADIUS = 2.8;
const LAUNCH_DISTANCE = 4.5;     // the launch point is this far in front of the camera, straight behind the laser-origin marker
const EXPLOSION_SECONDS = 0.65;
const EXPLOSION_SIZE = 0.55;     // max fireball radius
const SPARKS = 10;
const MISS_SIDE_OFFSET = [0.9, 1.5]; // a missed missile passes this far beside the target
const MISS_EXTEND = 1.6;             // ...and keeps flying this much farther than the target

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();

// --- error boundary: a missing / broken missile.glb must never take the scene down ------------
class ModelBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* fall back to the built-in missile */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// --- the missile body (nose points along +Z) -----------------------------------------------------
function BuiltInMissile() {
  const L = MISSILE_LENGTH;
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[L * 0.09, L * 0.09, L * 0.7, 10]} />
        <meshStandardMaterial color="#d8dde6" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, L * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[L * 0.09, L * 0.3, 10]} />
        <meshStandardMaterial color="#ff4d4d" metalness={0.3} roughness={0.4} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0, -L * 0.28]} rotation={[0, 0, (i * Math.PI) / 2]}>
          <boxGeometry args={[L * 0.025, L * 0.26, L * 0.16]} />
          <meshStandardMaterial color="#8a93a3" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function GlbMissile() {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;

    // Re-centre, scale to MISSILE_LENGTH, and turn the model's LONG axis onto +Z (the flight direction).
    const holder = new THREE.Group();
    root.position.sub(center);
    holder.add(root);
    const inner = new THREE.Group();
    inner.add(holder);
    inner.scale.setScalar(MISSILE_LENGTH / longest);
    if (size.x === longest) inner.rotation.y = -Math.PI / 2;      // long axis X -> Z
    else if (size.y === longest) inner.rotation.x = Math.PI / 2;  // long axis Y -> Z
    const outer = new THREE.Group();
    outer.add(inner);
    if (MODEL_NOSE_IS_NEGATIVE) outer.rotation.y = Math.PI;
    return outer;
  }, [scene]);
  return <primitive object={model} />;
}

// --- one missile in flight + its explosion -------------------------------------------------------
function Shot({ shot, onFinished }) {
  const missileRef = useRef();
  const flameRef = useRef();
  const fireRef = useRef();
  const sparksRef = useRef();
  const camera = useThree((s) => s.camera);

  const s = useRef(null);
  if (s.current === null) {
    const st = useGameStore.getState();
    const d = st.debrisList.find((x) => x.id === shot.debrisId);
    const tp = d ? positionAtTime(d, st.simTime) : new THREE.Vector3();
    const tv = new THREE.Vector3(tp.x, tp.y, tp.z);

    // Launch point: the same place the laser starts from - the origin marker on screen (bottom centre).
    // Turn that pixel into a ray from the camera and start the missile a little way along it.
    const o = getLaserOrigin();
    const ndcX = o ? (o.x / o.w) * 2 - 1 : 0;
    const ndcY = o ? -(o.y / o.h) * 2 + 1 : -0.55; // fallback: bottom centre
    const origin = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize()
      .multiplyScalar(LAUNCH_DISTANCE).add(camera.position);

    const miss = shot.outcome === 'MISS';
    const side = new THREE.Vector3().crossVectors(tv.clone().sub(origin), camera.position).normalize();
    if (side.lengthSq() < 1e-6) side.set(0, 1, 0);
    const off = (MISS_SIDE_OFFSET[0] + Math.random() * (MISS_SIDE_OFFSET[1] - MISS_SIDE_OFFSET[0])) * (Math.random() < 0.5 ? -1 : 1);

    s.current = {
      t: 0,
      phase: 'fly',          // 'fly' -> 'boom' (hit) | done (miss)
      origin,
      lastTarget: tv,
      missOffset: side.multiplyScalar(off),
      boomT: 0,
      boomAt: new THREE.Vector3(),
      impacted: false,
      sparkDirs: Array.from({ length: SPARKS }, () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()),
    };
  }

  useFrame((_, delta) => {
    const st = s.current;
    const dt = Math.min(delta, 0.1);
    const miss = shot.outcome === 'MISS';

    if (st.phase === 'fly') {
      st.t += dt;
      const u = Math.min(1, st.t / shot.flight);

      // Home in on the debris' CURRENT position (it keeps orbiting while the missile flies).
      const state = useGameStore.getState();
      const d = state.debrisList.find((x) => x.id === shot.debrisId);
      if (d) {
        const p = positionAtTime(d, state.simTime);
        st.lastTarget.set(p.x, p.y, p.z);
      }
      _target.copy(st.lastTarget);
      if (miss) _target.add(st.missOffset);

      const e = u * u * (3 - 2 * u) * 0.35 + u * u * 0.65; // eases in: slow lift-off, fast finish
      const reach = miss ? MISS_EXTEND : 1;
      _a.copy(st.origin).lerp(_target, e * reach);

      // Never dip into the planet on the way up.
      const r = _a.length();
      if (r < EARTH_RADIUS + 0.06) _a.multiplyScalar((EARTH_RADIUS + 0.06) / Math.max(r, 1e-6));

      if (missileRef.current) {
        _dir.copy(_a).sub(missileRef.current.position);
        if (_dir.lengthSq() > 1e-10) {
          _b.copy(_a).add(_dir);
          missileRef.current.position.copy(_a);
          missileRef.current.lookAt(_b);
        } else {
          missileRef.current.position.copy(_a);
        }
        missileRef.current.visible = true;
      }
      if (flameRef.current) flameRef.current.scale.setScalar(0.8 + Math.random() * 0.5);

      if (u >= 1) {
        if (!st.impacted) { st.impacted = true; shot.onImpact(); } // game result is applied now
        if (missileRef.current) missileRef.current.visible = false; // missile disappears
        if (miss) { onFinished(); return; }
        st.phase = 'boom';
        st.boomAt.copy(_a);
      }
      return;
    }

    // explosion
    st.boomT += dt;
    const k = st.boomT / EXPLOSION_SECONDS;
    if (k >= 1) { onFinished(); return; }
    if (fireRef.current) {
      fireRef.current.position.copy(st.boomAt);
      fireRef.current.scale.setScalar(EXPLOSION_SIZE * Math.sqrt(k) + 0.01);
      fireRef.current.material.opacity = 0.9 * (1 - k) * (1 - k);
      fireRef.current.material.color.setHSL(0.1 - 0.08 * k, 1, 0.65 - 0.25 * k); // white-yellow -> orange-red
    }
    if (sparksRef.current) {
      sparksRef.current.position.copy(st.boomAt);
      sparksRef.current.children.forEach((c, i) => {
        c.position.copy(st.sparkDirs[i]).multiplyScalar(EXPLOSION_SIZE * 1.3 * Math.sqrt(k));
        c.material.opacity = 1 - k;
      });
    }
  });

  return (
    <>
      <group ref={missileRef} visible={false}>
        <ModelBoundary fallback={<BuiltInMissile />}>
          <Suspense fallback={<BuiltInMissile />}>
            <GlbMissile />
          </Suspense>
        </ModelBoundary>
        {/* exhaust flame behind the missile */}
        <mesh ref={flameRef} position={[0, 0, -MISSILE_LENGTH * 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[MISSILE_LENGTH * 0.07, MISSILE_LENGTH * 0.5, 8]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>

      {/* explosion: fireball + sparks (only ever visible on a hit) */}
      <mesh ref={fireRef} visible={shot.outcome !== 'MISS'}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <group ref={sparksRef}>
        {Array.from({ length: SPARKS }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.025, 6, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </>
  );
}

export default function MissileEffects() {
  const [shots, setShots] = useState([]);
  const nextId = useRef(0);

  useEffect(() => {
    const off = onMissileShot((shot) => {
      const id = ++nextId.current;
      setShots((cur) => [...cur, { id, shot }]);
    });
    return off;
  }, []);

  // A restart / new level must not leave a stray missile hanging around.
  const runId = useGameStore((s) => s.runId);
  useEffect(() => { setShots([]); }, [runId]);

  return (
    <group>
      {shots.map(({ id, shot }) => (
        <Shot key={id} shot={shot} onFinished={() => setShots((cur) => cur.filter((x) => x.id !== id))} />
      ))}
    </group>
  );
}
