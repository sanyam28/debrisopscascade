

'use client';

import React, { useRef, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function EarthModel() {
  const earthRef = useRef();
  const { scene } = useGLTF('/earth.glb');

  // Runs once per loaded scene. Works on a clone so the cached GLTF is never modified.
  const model = useMemo(() => {
    const root = scene.clone(true);

    // Reset, then measure at scale 1 (the raw model is ~1000 units wide)
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 0) {
      const s = 5.6 / maxDim; // final diameter 5.6 => radius 2.8
      root.scale.setScalar(s);
      root.position.copy(center).multiplyScalar(-s);
    }

    root.traverse((child) => {
      if (!child.isMesh) return;
      child.frustumCulled = false;

      if (child.material) {
        child.material = child.material.clone();
        child.material.vertexColors = false;
        if (child.material.emissive) {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }
        if ('roughness' in child.material) child.material.roughness = 0.7;
        if ('metalness' in child.material) child.material.metalness = 0.1;
        child.material.needsUpdate = true;
      }
    });

    return root;
  }, [scene]);

  useFrame((state, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <group rotation={[0, 0, THREE.MathUtils.degToRad(23.44)]}>
      <group ref={earthRef}>
        <primitive object={model} />
      </group>
    </group>
  );
}

function EarthFallback() {
  return (
    <mesh>
      <sphereGeometry args={[2.8, 32, 32]} />
      <meshStandardMaterial color="#1a4d8c" roughness={0.6} />
    </mesh>
  );
}

export default function Earth() {
  return (
    <Suspense fallback={<EarthFallback />}>
      <EarthModel />
    </Suspense>
  );
}

useGLTF.preload('/earth.glb');