'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';

function EarthModel() {
  const { scene } = useGLTF('/earth.glb'); 
  return <primitive object={scene} scale={1.5} />;
}

export default function EarthScene() {
  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [0, 0, 5], near: 0.1, far: 1000 }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[10, 10, 5]} intensity={2} />
        <EarthModel />
        <OrbitControls enableZoom={true} />
      </Canvas>
    </div>
  );
}

useGLTF.preload('/earth.glb');