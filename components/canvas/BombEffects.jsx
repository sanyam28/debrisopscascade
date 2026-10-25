'use client';

import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import { positionAtTime } from '../../utils/orbit';
import {
  onBombShot, BOMB_FLIGHT_SECONDS, BOMB_RADIATE_SECONDS, BOMB_FRAGMENT_SECONDS, BOMB_FRAGMENT_STAGGER,
} from '../../utils/missileFx';
import { BOMB_BLAST_RADIUS } from '../../utils/levels';
import { getLaunchOrigin } from './launchOrigin';

// Draws the bomb (must sit INSIDE <Canvas>). The bomb is a bowling ball:
//   1. it is thrown from the laser origin to a point just short of the selected red debris,
//   2. there it stops and RADIATES from its three finger holes (glowing beams + rings + the blast zone swelling),
//   3. it bursts into 1-3 fragments (one per debris it catches), which fly to their targets,
//   4. each fragment explodes on arrival; the store destroys that debris at that moment (onVictim).
//
// Put your model at  public/bomb.glb . Until it exists a simple built-in bowling ball is drawn instead.

const MODEL_URL = '/bomb.glb';
const BOMB_DIAMETER = 0.45;       // scene units (debris are ~0.2 wide) - make smaller / bigger here
const STANDOFF = 1.0;             // the bomb stops this far short of the selected debris, on the side facing you
const EARTH_RADIUS = 2.8;
const MAX_FRAGMENTS = 3;
const FRAGMENT_SIZE = 0.1;
const EXPLOSION_SECONDS = 0.6;
const EXPLOSION_SIZE = 0.5;
const SPARKS = 8;

// Where the three finger holes sit on the ball, in ball space; the hole side (+Z) is turned to face the camera
// while radiating. Two close finger holes above, one thumb hole below - tweak to match your bomb.glb.
const HOLE_DIRS = [
  new THREE.Vector3(-0.24, 0.3, 0.92).normalize(),
  new THREE.Vector3(0.24, 0.3, 0.92).normalize(),
  new THREE.Vector3(0, -0.3, 0.95).normalize(),
];
const _Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();

class ModelBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* fall back to the built-in ball */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function BuiltInBall() {
  const R = BOMB_DIAMETER / 2;
  return (
    <group>
      <mesh>
        <sphereGeometry args={[R, 24, 24]} />
        <meshStandardMaterial color="#1b2a6b" metalness={0.5} roughness={0.2} />
      </mesh>
      {HOLE_DIRS.map((d, i) => (
        <mesh key={i} position={d.clone().multiplyScalar(R * 0.98)} quaternion={_q.clone().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d)}>
          <circleGeometry args={[R * 0.13, 16]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
      ))}
    </group>
  );
}

function GlbBall() {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    root.position.sub(center);
    const holder = new THREE.Group();
    holder.add(root);
    holder.scale.setScalar(BOMB_DIAMETER / longest);
    return holder;
  }, [scene]);
  return <primitive object={model} />;
}

const addMat = (color, opacity = 0) => (
  <meshBasicMaterial color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
);

function Show({ shot, onFinished }) {
  const camera = useThree((s) => s.camera);

  const ballRef = useRef();      // moves / shakes
  const faceRef = useRef();      // turned so the holes face the camera; carries the ball + hole effects
  const beamRefs = useRef([]);
  const holeGlowRefs = useRef([]);
  const ringRefs = useRef([]);
  const auraRef = useRef();
  const zoneRef = useRef();
  const flashRef = useRef();
  const fragRefs = useRef([]);
  const fireRefs = useRef([]);
  const sparkRefs = useRef([]);

  const n = Math.min(MAX_FRAGMENTS, shot.victimIds.length);
  const R = BOMB_DIAMETER / 2;

  const s = useRef(null);
  if (s.current === null) {
    const st = useGameStore.getState();
    const tgt = st.debrisList.find((d) => d.id === shot.targetId);
    const tp = tgt ? positionAtTime(tgt, st.simTime) : { x: 0, y: 6, z: 0 };
    const target = new THREE.Vector3(tp.x, tp.y, tp.z);
    const origin = getLaunchOrigin(camera);
    s.current = {
      t: 0,
      origin,
      target,
      det: new THREE.Vector3(),
      detSet: false,
      burst: false,
      doneCalled: false,
      // last known position of each victim (used if it disappears mid-flight)
      last: shot.victimIds.map(() => target.clone()),
      frag: shot.victimIds.slice(0, MAX_FRAGMENTS).map(() => ({ started: false, arrived: false, t0: 0, boomT: 0 })),
      sparkDirs: Array.from({ length: MAX_FRAGMENTS * SPARKS }, () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()),
    };
  }

  const victimPos = (i, out) => {
    const state = useGameStore.getState();
    const d = state.debrisList.find((x) => x.id === shot.victimIds[i]);
    if (d) {
      const p = positionAtTime(d, state.simTime);
      s.current.last[i].set(p.x, p.y, p.z);
    }
    return out.copy(s.current.last[i]);
  };

  useFrame((_, delta) => {
    const st = s.current;
    const dt = Math.min(delta, 0.1);
    st.t += dt;
    const F = BOMB_FLIGHT_SECONDS;
    const Rd = BOMB_RADIATE_SECONDS;

    // ---------- 1. fly to the detonation point ----------
    if (st.t < F + Rd) {
      // the target keeps orbiting: track it, and keep the stop point STANDOFF short of it on the camera/launch side
      victimPos(0, _a);
      _b.copy(st.origin).sub(_a);
      _b.normalize().multiplyScalar(STANDOFF);
      st.det.copy(_a).add(_b);
      st.detSet = true;
    }

    const ball = ballRef.current;
    const face = faceRef.current;
    if (st.t < F) {
      const u = st.t / F;
      const e = u * u * (3 - 2 * u);
      _a.copy(st.origin).lerp(st.det, e);
      const r = _a.length();
      if (r < EARTH_RADIUS + 0.2) _a.multiplyScalar((EARTH_RADIUS + 0.2) / Math.max(r, 1e-6));
      if (ball) {
        ball.visible = true;
        ball.position.copy(_a);
        ball.rotation.x += dt * 7; // rolling as it is thrown
        ball.rotation.z += dt * 4;
      }
      return;
    }

    // ---------- 2. radiate from the three holes ----------
    if (st.t < F + Rd) {
      const k = (st.t - F) / Rd;
      if (ball) {
        ball.position.copy(st.det);
        ball.position.x += (Math.random() - 0.5) * 0.02 * k; // shaking harder as it charges
        ball.position.y += (Math.random() - 0.5) * 0.02 * k;
        ball.rotation.set(0, 0, 0);
        ball.quaternion.copy(camera.quaternion); // holes (+Z) now face the camera
      }
      if (face) face.visible = true;
      HOLE_DIRS.forEach((d, i) => {
        const beam = beamRefs.current[i];
        if (beam) {
          beam.visible = true;
          const len = (0.3 + 1.6 * k) * (0.85 + Math.random() * 0.3);
          beam.scale.set(1 + k, len, 1 + k);
          beam.children[0].material.opacity = 0.35 + 0.5 * Math.random();
        }
        const glow = holeGlowRefs.current[i];
        if (glow) {
          glow.visible = true;
          glow.scale.setScalar(0.6 + 1.4 * k);
          glow.material.opacity = 0.5 + 0.5 * k;
        }
      });
      ringRefs.current.forEach((ring, i) => {
        if (!ring) return;
        const kk = (k * 1.6 + i * 0.33) % 1; // three staggered rings pulsing outward
        ring.visible = true;
        ring.position.copy(st.det);
        ring.quaternion.copy(camera.quaternion);
        ring.scale.setScalar(R * (1.2 + 5 * kk));
        ring.material.opacity = 0.8 * (1 - kk);
      });
      if (auraRef.current) {
        auraRef.current.visible = true;
        auraRef.current.position.copy(st.det);
        auraRef.current.scale.setScalar(R * (1.1 + 1.2 * k));
        auraRef.current.material.opacity = 0.25 + 0.35 * k;
      }
      if (zoneRef.current) { // the blast zone swelling up: shows how far the bomb reaches
        zoneRef.current.visible = true;
        zoneRef.current.position.copy(st.last[0]); // centred on the selected debris
        zoneRef.current.scale.setScalar(BOMB_BLAST_RADIUS * k);
        zoneRef.current.material.opacity = 0.12 * (1 - 0.3 * k);
      }
      return;
    }

    // ---------- 3. burst: the ball goes, fragments fly ----------
    if (!st.burst) {
      st.burst = true;
      if (ball) ball.visible = false;
      beamRefs.current.forEach((b) => b && (b.visible = false));
      holeGlowRefs.current.forEach((g) => g && (g.visible = false));
      ringRefs.current.forEach((r) => r && (r.visible = false));
      if (auraRef.current) auraRef.current.visible = false;
      if (zoneRef.current) zoneRef.current.visible = false;
      st.flashT = 0;
      for (let i = 0; i < n; i++) st.frag[i].t0 = i * BOMB_FRAGMENT_STAGGER;
    }
    st.flashT += dt;
    if (flashRef.current) {
      const fk = Math.min(1, st.flashT / 0.25);
      flashRef.current.visible = fk < 1;
      flashRef.current.position.copy(st.det);
      flashRef.current.scale.setScalar(R * (1 + 4 * fk));
      flashRef.current.material.opacity = 0.9 * (1 - fk);
    }

    const sinceBurst = st.t - (F + Rd);
    let allDone = true;
    for (let i = 0; i < n; i++) {
      const f = st.frag[i];
      const fm = fragRefs.current[i];
      if (!f.arrived) {
        allDone = false;
        const u = Math.max(0, Math.min(1, (sinceBurst - f.t0) / BOMB_FRAGMENT_SECONDS));
        victimPos(i, _b);
        const e = u * u; // accelerates onto the target
        _a.copy(st.det).lerp(_b, e);
        // a little sideways spray at the start so the fragments visibly fan out
        const fan = (1 - u) * 0.35;
        _a.x += Math.sin(i * 2.1 + 1) * fan;
        _a.y += Math.cos(i * 2.1 + 1) * fan;
        if (fm) {
          fm.visible = sinceBurst >= f.t0;
          fm.position.copy(_a);
          fm.rotation.x += dt * 14;
          fm.rotation.y += dt * 9;
        }
        if (u >= 1) {
          f.arrived = true;
          f.boomPos = _b.clone();
          if (fm) fm.visible = false;
          shot.onVictim(shot.victimIds[i]); // the debris is destroyed right now
        }
      } else {
        f.boomT += dt;
        const k = f.boomT / EXPLOSION_SECONDS;
        const fire = fireRefs.current[i];
        if (k < 1) {
          allDone = false;
          if (fire) {
            fire.visible = true;
            fire.position.copy(f.boomPos);
            fire.scale.setScalar(EXPLOSION_SIZE * Math.sqrt(k) + 0.01);
            fire.material.opacity = 0.9 * (1 - k) * (1 - k);
            fire.material.color.setHSL(0.1 - 0.08 * k, 1, 0.65 - 0.25 * k);
          }
          for (let j = 0; j < SPARKS; j++) {
            const sp = sparkRefs.current[i * SPARKS + j];
            if (!sp) continue;
            sp.visible = true;
            sp.position.copy(f.boomPos).addScaledVector(st.sparkDirs[i * SPARKS + j], EXPLOSION_SIZE * 1.4 * Math.sqrt(k));
            sp.material.opacity = 1 - k;
          }
        } else {
          if (fire) fire.visible = false;
          for (let j = 0; j < SPARKS; j++) { const sp = sparkRefs.current[i * SPARKS + j]; if (sp) sp.visible = false; }
        }
      }
    }
    if (allDone && !st.doneCalled) {
      st.doneCalled = true;
      shot.onDone();
      onFinished();
    }
  });

  return (
    <>
      {/* the bowling ball; faceRef group is only used to place the hole effects in ball space */}
      <group ref={ballRef} visible={false}>
        <ModelBoundary fallback={<BuiltInBall />}>
          <Suspense fallback={<BuiltInBall />}>
            <GlbBall />
          </Suspense>
        </ModelBoundary>
        <group ref={faceRef} visible={false}>
          {HOLE_DIRS.map((d, i) => (
            <group key={i}>
              {/* glowing hole */}
              <mesh ref={(el) => (holeGlowRefs.current[i] = el)} position={d.clone().multiplyScalar(R * 1.02)} visible={false}>
                <sphereGeometry args={[R * 0.16, 10, 10]} />
                {addMat('#9ff6ff', 0)}
              </mesh>
              {/* radiation beam shooting out of the hole (group scaled on Y = length) */}
              <group
                ref={(el) => (beamRefs.current[i] = el)}
                position={d.clone().multiplyScalar(R * 1.02)}
                quaternion={_q.clone().setFromUnitVectors(_Y, d)}
                visible={false}
              >
                <mesh position={[0, 0.5, 0]}>
                  <cylinderGeometry args={[R * 0.05, R * 0.12, 1, 8, 1, true]} />
                  {addMat('#7ee8ff', 0.6)}
                </mesh>
              </group>
            </group>
          ))}
        </group>
      </group>

      {/* effects that live in world space */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => (ringRefs.current[i] = el)} visible={false}>
          <ringGeometry args={[0.92, 1, 40]} />
          {addMat('#8ff0ff', 0)}
        </mesh>
      ))}
      <mesh ref={auraRef} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        {addMat('#4fd8ff', 0)}
      </mesh>
      <mesh ref={zoneRef} visible={false}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color="#ff8a3d" transparent opacity={0} wireframe depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={flashRef} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        {addMat('#ffffff', 0)}
      </mesh>

      {/* fragments, and one explosion per fragment */}
      {Array.from({ length: n }, (_, i) => (
        <React.Fragment key={i}>
          <mesh ref={(el) => (fragRefs.current[i] = el)} visible={false}>
            <octahedronGeometry args={[FRAGMENT_SIZE, 0]} />
            <meshBasicMaterial color="#ffcf6b" />
          </mesh>
          <mesh ref={(el) => (fireRefs.current[i] = el)} visible={false}>
            <sphereGeometry args={[1, 16, 16]} />
            {addMat('#ffffff', 0)}
          </mesh>
          {Array.from({ length: SPARKS }, (_, j) => (
            <mesh key={j} ref={(el) => (sparkRefs.current[i * SPARKS + j] = el)} visible={false}>
              <sphereGeometry args={[0.025, 6, 6]} />
              {addMat('#ffd27a', 1)}
            </mesh>
          ))}
        </React.Fragment>
      ))}
    </>
  );
}

export default function BombEffects() {
  const [shows, setShows] = useState([]);
  const nextId = useRef(0);

  useEffect(() => {
    const off = onBombShot((shot) => {
      const id = ++nextId.current;
      setShows((cur) => [...cur, { id, shot }]);
    });
    return off;
  }, []);

  const runId = useGameStore((s) => s.runId);
  useEffect(() => { setShows([]); }, [runId]); // restart / new level: no stray bomb

  return (
    <group>
      {shows.map(({ id, shot }) => (
        <Show key={id} shot={shot} onFinished={() => setShows((cur) => cur.filter((x) => x.id !== id))} />
      ))}
    </group>
  );
}
