'use client';

import React, { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Billboard } from '@react-three/drei';
import * as THREE from 'three';
// Add/Replace Debris Components in OrbitalEntities.jsx
import { useGameStore } from '../../store/useGameStore';
import { orbitalPosition } from '../../utils/orbit';
import { setAimFromCamera, setAimScreen } from '../../utils/aim';

// --- Earth occlusion: debris hidden behind the planet must not be clickable -------
// R3F only raycasts objects that have event handlers, and Earth has none, so a ray
// passes straight "through" the planet and hits the debris behind it. We test the ray
// against an invisible sphere the size of the Earth (must match Earth.jsx: diameter 5.6).
const EARTH_RADIUS = 2.8;
const EARTH_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0, 0), EARTH_RADIUS);
const _earthHit = new THREE.Vector3();
const _proj = new THREE.Vector3();
const MIN_GLIDE_DIST = EARTH_RADIUS + 0.5; // debris never renders closer to Earth's centre than this

/** true if the Earth is between the camera and the point the pointer ray hit. */
function isBehindEarth(e) {
  const p = e.ray.intersectSphere(EARTH_SPHERE, _earthHit);
  return p !== null && e.ray.origin.distanceTo(p) < e.distance;
}

// Two clicks on the same debris within this many ms = "double tap" => fire the laser.
const DOUBLE_TAP_MS = 350;

// --- Targeting reticle: the "aiming" animation ---------------------------------
// mode 'aiming' : player is hovering the debris. A big ring zooms in and spins fast.
// mode 'locked' : player clicked. The ring snaps tight, turns green and pulses.
function AimReticle({ mode, color, radius = 0.6 }) {
  const groupRef = useRef();
  const spinRef = useRef();
  const scaleRef = useRef(2.6); // starts big, so mounting = zoom-in
  const clock = useRef(0);

  useFrame((_, delta) => {
    clock.current += delta;
    const locked = mode === 'locked';
    const target = locked ? 1 : 1.4;
    scaleRef.current += (target - scaleRef.current) * (1 - Math.exp(-9 * delta));
    const pulse = locked ? 1 + Math.sin(clock.current * 7) * 0.06 : 1;
    if (groupRef.current) groupRef.current.scale.setScalar(scaleRef.current * pulse);
    if (spinRef.current) spinRef.current.rotation.z += delta * (locked ? 0.8 : 3.2);
  });

  const mat = (opacity) => (
    <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} />
  );

  return (
    <Billboard>
      <group ref={groupRef} renderOrder={20}>
        {/* spinning outer ring with 4 tick marks */}
        <group ref={spinRef}>
          <mesh renderOrder={20}>
            <ringGeometry args={[radius * 0.93, radius, 48]} />
            {mat(0.85)}
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              renderOrder={20}
              position={[Math.cos((i * Math.PI) / 2) * radius * 1.12, Math.sin((i * Math.PI) / 2) * radius * 1.12, 0]}
              rotation={[0, 0, (i * Math.PI) / 2]}
            >
              <planeGeometry args={[radius * 0.28, radius * 0.07]} />
              {mat(1)}
            </mesh>
          ))}
        </group>

        {/* fixed centre cross-hair */}
        <mesh renderOrder={20}>
          <planeGeometry args={[radius * 0.55, radius * 0.035]} />
          {mat(0.7)}
        </mesh>
        <mesh renderOrder={20}>
          <planeGeometry args={[radius * 0.035, radius * 0.55]} />
          {mat(0.7)}
        </mesh>
      </group>
    </Billboard>
  );
}

function InteractiveDebrisPiece({ id, radius, speed, inclination, axisAngle, initialAngle, size, isHighRisk }) {
  const groupRef = useRef();        // moves along the orbit (also carries hit-area + reticle)
  const spinRef = useRef();         // the visible debris, tumbling in place
  const placedRef = useRef(false);  // false until the first frame positions the group
  const [hovered, setHovered] = useState(false);
  const lastTapRef = useRef(0);    // time of the previous click on this debris (double-tap detection)

  const selectedDebrisId = useGameStore((state) => state.selectedDebrisId);
  const selectDebris = useGameStore((state) => state.selectDebris);
  const setHoveredDebris = useGameStore((state) => state.setHoveredDebris);

  const isSelected = selectedDebrisId === id;

  // While aiming at this debris: crosshair cursor, and tell the store which debris is
  // "aimed at" (the Space-bar missile fires at it). Always undone on un-hover / removal.
  useEffect(() => {
    if (!hovered) return undefined;
    document.body.style.cursor = 'crosshair';
    setHoveredDebris(id);
    return () => {
      document.body.style.cursor = 'auto';
      if (useGameStore.getState().hoveredDebrisId === id) setHoveredDebris(null);
    };
  }, [hovered, id, setHoveredDebris]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    // Shared sim clock => on-screen position == position used for risk maths
    const t = useGameStore.getState().simTime;
    const pos = getOrbitalPosition(radius, initialAngle + speed * t, inclination, axisAngle);
    if (!placedRef.current) {
      groupRef.current.position.copy(pos);
      placedRef.current = true;
    } else {
      // Glide to the target instead of teleporting, so a laser nudge is visible
      groupRef.current.position.lerp(pos, 1 - Math.exp(-6 * delta));
      // Rule: never pass close to the Earth while gliding (a straight lerp can cut through it)
      const d = groupRef.current.position.length();
      if (d < MIN_GLIDE_DIST) groupRef.current.position.multiplyScalar(MIN_GLIDE_DIST / Math.max(d, 1e-6));
    }
    // Keep the laser aim (camera -> this debris) fresh for button / keyboard fire.
    if (isSelected) {
      setAimFromCamera(state.camera.position, groupRef.current.position);
      // Where the target is on screen (for the laser beam drawn by the HUD)
      _proj.copy(groupRef.current.position).project(state.camera);
      setAimScreen(
        (_proj.x * 0.5 + 0.5) * state.size.width,
        (-_proj.y * 0.5 + 0.5) * state.size.height,
        state.size.width,
        state.size.height,
        _proj.z < 1
      );
    }
    if (spinRef.current) {
      spinRef.current.rotation.x += delta * 0.5;
      spinRef.current.rotation.y += delta * 0.3;
    }
  });

  // Determine indicator color based on status
  const color = isSelected ? '#00ffcc' : isHighRisk ? '#ff3333' : '#888888';

  // Invisible "click bubble" around the debris. Red high-risk debris gets a much
  // bigger one so it is easy to hit; the visible debris is also drawn bigger.
  const hitRadius = isHighRisk ? 0.8 : 0.45;
  const visualSize = isHighRisk ? size * 1.3 : size;
  const reticleColor = isSelected ? '#00ffcc' : isHighRisk ? '#ff4d4d' : '#ffd34d';

  return (
    <group ref={groupRef}>
      <mesh ref={spinRef}>
        <dodecahedronGeometry args={[isSelected ? visualSize * 1.4 : visualSize, 1]} />
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          metalness={0.5}
          emissive={isSelected ? '#00ffcc' : isHighRisk ? '#ff0000' : '#000000'}
          emissiveIntensity={isSelected || isHighRisk ? 0.6 : 0}
        />
      </mesh>

      {/* Invisible, oversized click target (opacity 0 still receives pointer events) */}
      <mesh
        onClick={(e) => {
          if (isBehindEarth(e)) return; // hidden by the planet: ignore the click
          e.stopPropagation();
          selectDebris(id);

          // Double tap (two quick clicks/taps on the same debris) => fire the laser.
          const now = performance.now();
          if (now - lastTapRef.current < DOUBLE_TAP_MS) {
            lastTapRef.current = 0;
            // e.ray.direction = the actual raycast direction of this click (world space)
            const d = e.ray.direction;
            useGameStore.getState().fireLaser({ x: d.x, y: d.y, z: d.z });
          } else {
            lastTapRef.current = now;
          }
        }}
        onPointerOver={(e) => {
          if (isBehindEarth(e)) return;
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerMove={(e) => setHovered(!isBehindEarth(e))}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[hitRadius, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {(hovered || isSelected) && (
        <AimReticle mode={isSelected ? 'locked' : 'aiming'} color={reticleColor} radius={isHighRisk ? 0.6 : 0.45} />
      )}
    </group>
  );
}
// Advances the shared simulation clock once per frame (and, through the store,
// refreshes each debris' distance-based risk a few times per second).
export function SimulationDriver() {
  const advanceSimulation = useGameStore((state) => state.advanceSimulation);
  useFrame((_, delta) => advanceSimulation(Math.min(delta, 0.1))); // clamp tab-switch spikes
  return null;
}

export function DynamicDebrisField() {
  const debrisList = useGameStore((state) => state.debrisList);

  return (
    <group>
      {debrisList.map((item) => (
        <InteractiveDebrisPiece key={item.id} {...item} />
      ))}
    </group>
  );
}
// --- Realistic Animated Starfield Background ---
export function SpaceBackground({ count = 4000 }) {
  const starsRef = useRef();

  // Create stars with realistic distribution, brightness, and colors (blue-white to warm yellow)
  const [positions, colors, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sz = new Float32Array(count);

    const starColors = [
      new THREE.Color('#ffffff'), // Main sequence white
      new THREE.Color('#9bb0ff'), // Hot blue-white
      new THREE.Color('#ffcc6f'), // Warm yellow-orange
      new THREE.Color('#cad8ff'), // Cool blue
    ];

    for (let i = 0; i < count; i++) {
      // Distribute stars on a far spherical outer shell
      const radius = 80 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);

      // Random color assignment
      const color = starColors[Math.floor(Math.random() * starColors.length)];
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;

      // Variable star sizes
      sz[i] = 0.15 + Math.random() * 0.35;
    }

    return [pos, col, sz];
  }, [count]);

  // Animate slow cosmic background drift and twinkling effect
  useFrame((state, delta) => {
    if (starsRef.current) {
      starsRef.current.rotation.y += delta * 0.005; // Slow galactic rotation
      starsRef.current.rotation.x += delta * 0.002;
    }
  });

  return (
    <group>
      {/* Deep Space Background Stars */}
      <points ref={starsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={colors.length / 3}
            array={colors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.4}
          vertexColors={true}
          transparent={true}
          opacity={0.9}
          sizeAttenuation={true}
        />
      </points>
    </group>
  );
}

// Helper function to calculate exact 3D orbital position vector
// function getOrbitalPosition(radius, angle, inclinationAngle, axisAngle = 0) {
//   const vec = new THREE.Vector3(
//     radius * Math.cos(angle),
//     0,
//     radius * Math.sin(angle)
//   );

//   vec.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationAngle);
//   vec.applyAxisAngle(new THREE.Vector3(0, 1, 0), axisAngle);

//   return vec;
// }

function getOrbitalPosition(radius, angle, inclinationAngle, axisAngle = 0) {
  const { x, y, z } = orbitalPosition(radius, angle, inclinationAngle, axisAngle);
  return new THREE.Vector3(x, y, z);
}

// --- Visible Orbit Line for Satellites ---
export function OrbitRing({ radius, inclination, axisAngle, color = '#ffffff' }) {
  const points = useMemo(() => {
    const pts = [];
    const segments = 128;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(getOrbitalPosition(radius, angle, inclination, axisAngle));
    }

    return pts;
  }, [radius, inclination, axisAngle]);

  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  return (
    <line geometry={lineGeometry}>
      <lineBasicMaterial attach="material" color={color} transparent opacity={0.35} linewidth={1} />
    </line>
  );
}
// Add this to OrbitalEntities.jsx
export function SatelliteModel({ 
  modelPath,
  radius = 6.0, 
  speed = 0.4, 
  inclination = Math.PI / 6, 
  axisAngle = 0,
  scale = 0.1, 
  initialAngle = 0,
  showOrbit = true,
  orbitColor = '#ffffff'
}) {
  const satRef = useRef();
  //const angleRef = useRef(initialAngle);

  // Dynamically load the GLTF model specified in modelPath
  const { scene } = useGLTF(modelPath);

  useFrame((state, delta) => {
    if (satRef.current) {
      // angleRef.current += speed * delta;
      
      // const pos = getOrbitalPosition(radius, angleRef.current, inclination, axisAngle);

      const t = useGameStore.getState().simTime;
      const pos = getOrbitalPosition(radius, initialAngle + speed * t, inclination, axisAngle);
      satRef.current.position.copy(pos);
      satRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <group>
      {showOrbit && (
        <OrbitRing 
          radius={radius} 
          inclination={inclination} 
          axisAngle={axisAngle} 
          color={orbitColor} 
        />
      )}

      <group ref={satRef} scale={scale}>
        <primitive object={scene.clone()} />
      </group>
    </group>
  );
}

export function ISS({ 
  radius = 6.0, 
  speed = 0.4, 
  inclination = Math.PI / 6, 
  axisAngle = 0,
  scale = 0.05, // GLTF models are usually large; adjust scale as needed
  initialAngle = 0,
  showOrbit = true
}) {
  const issRef = useRef();
  const angleRef = useRef(initialAngle);

  // Path to model placed inside public/iss.glb
  const { scene } = useGLTF('/iss.glb');

  useFrame((state, delta) => {
    if (issRef.current) {
      const t = useGameStore.getState().simTime;
      const pos = getOrbitalPosition(radius, initialAngle + speed * t, inclination, axisAngle);
      issRef.current.position.copy(pos);
      issRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <group>
      {showOrbit && (
        <OrbitRing 
          radius={radius} 
          inclination={inclination} 
          axisAngle={axisAngle} 
          color="#ffffff" 
        />
      )}

      {/* Suspense is required for asynchronous GLTF loading */}
      <Suspense fallback={null}>
        <group ref={issRef} scale={scale}>
          <primitive object={scene.clone()} />
        </group>
      </Suspense>
    </group>
  );
}

// Preload ISS asset to prevent render hitching
useGLTF.preload('/iss.glb');

// --- Reusable Satellite Component ---
export function Satellite({ 
  radius = 6.0, 
  speed = 0.4, 
  inclination = Math.PI / 6, 
  axisAngle = 0,
  scale = 1, 
  color = '#e0e0e0', 
  initialAngle = 0,
  showOrbit = true
}) {
  const satRef = useRef();
  const angleRef = useRef(initialAngle);

  useFrame((state, delta) => {
    if (satRef.current) {
      angleRef.current += speed * delta;
      
      const pos = getOrbitalPosition(radius, angleRef.current, inclination, axisAngle);
      satRef.current.position.copy(pos);
      satRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group>
      {showOrbit && (
        <OrbitRing 
          radius={radius} 
          inclination={inclination} 
          axisAngle={axisAngle} 
          color={color} 
        />
      )}

      <group ref={satRef} scale={scale}>
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.5]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[-0.6, 0, 0]}>
          <boxGeometry args={[0.6, 0.03, 0.3]} />
          <meshStandardMaterial color="#0055ff" roughness={0.3} />
        </mesh>
        <mesh position={[0.6, 0, 0]}>
          <boxGeometry args={[0.6, 0.03, 0.3]} />
          <meshStandardMaterial color="#0055ff" roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

// --- Individual Large Debris Object ---
function DebrisPiece({ radius, speed, inclination, axisAngle, initialAngle, size }) {
  const meshRef = useRef();
  const angleRef = useRef(initialAngle);

  useFrame((state, delta) => {
    if (meshRef.current) {
      angleRef.current += speed * delta;

      const pos = getOrbitalPosition(radius, angleRef.current, inclination, axisAngle);
      meshRef.current.position.copy(pos);
      
      meshRef.current.rotation.x += delta * 0.5;
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <mesh ref={meshRef}>
      <dodecahedronGeometry args={[size, 1]} />
      <meshStandardMaterial color="#888888" roughness={0.7} metalness={0.3} />
    </mesh>
  );
}

// --- Debris Field ---
export function LargeDebrisField({ count = 25 }) {
  const debrisData = useMemo(() => {
    const items = [];
    const orbitBands = [5.0, 5.8, 6.8, 7.8, 8.5];

    for (let i = 0; i < count; i++) {
      const radius = orbitBands[i % orbitBands.length] + (Math.random() - 0.5) * 0.3;
      const speed = (0.15 + Math.random() * 0.2) * (i % 2 === 0 ? 1 : -1);
      const inclination = ((i % 5) - 2) * (Math.PI / 8);
      const axisAngle = (i / count) * Math.PI * 2;
      const initialAngle = (i * 0.7) % (Math.PI * 2);
      const size = 0.12 + Math.random() * 0.08;

      items.push({ radius, speed, inclination, axisAngle, initialAngle, size, id: i });
    }
    return items;
  }, [count]);

  return (
    <group>
      {debrisData.map((item) => (
        <DebrisPiece key={item.id} {...item} />
      ))}
    </group>
  );
}