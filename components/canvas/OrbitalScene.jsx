'use client';

import React, { useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Earth from './Earth';
import { SpaceBackground, ISS, SatelliteModel, DynamicDebrisField, SimulationDriver } from './OrbitalEntities';
import Sidebar from '../ui/Sidebar';
import TopThreats from '../ui/TopThreats';
import PlayerBadge from '../ui/PlayerBadge';
import EndScreen from '../ui/EndScreen';
import ControlPanel from '../ui/ControlPanel';
import NoticeToasts from '../ui/NoticeToasts';
import PauseMenu from '../ui/PauseMenu';
import StartScreen from '../ui/StartScreen';
import KeyboardControls from '../ui/KeyboardControls';
import SpamLaserToggle from '../ui/SpamLaserToggle';
import CameraKeyControls from './CameraKeyControls';
import { useGameStore } from '../../store/useGameStore';
import { useProfileStore } from '../../store/useProfileStore';
import { MAX_LEVEL } from '../../utils/levels';
import { ISS_ORBIT } from '../../utils/risk';

export function OrbitalScene() {
  const initLevel = useGameStore((s) => s.initLevel);
  const tickTimer = useGameStore((s) => s.tickTimer);
  const level = useGameStore((s) => s.level);
  const threatLevel = useGameStore((s) => s.threatLevel);

  // Initialize level debris and start timer ticks for passive threat build-up
  useEffect(() => {
    // Load the player's profile from the server (it verifies the signed token saved in localStorage;
    // a missing token = new player, an edited one = reset to level 1), then open the title screen
    // on the level the player should be on.
    let alive = true;
    const profile = useProfileStore.getState();
    profile.ensureProfile().then(() => {
      if (!alive) return;
      initLevel(profile.getNextLevel(), 'START'); // title screen first: scenery moves, game clock frozen
    });
    const interval = setInterval(() => {
      tickTimer();
    }, 1000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [initLevel, tickTimer]);

  return (
    <div className="relative w-screen h-screen bg-[#020208] overflow-hidden select-none font-sans text-slate-100">
      
      {/* 1. Tactical Grid & Vignette Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/20 to-black/80" />
      <div 
        className="absolute inset-0 pointer-events-none z-10 opacity-10" 
        style={{ backgroundImage: `radial-gradient(#00f2ff 1px, transparent 1px)`, backgroundSize: '32px 32px' }}
      />

      {/* 2. Top Mission Header Bar */}
      <header className="absolute top-0 left-0 w-full z-20 pl-8 pr-28 py-4 flex items-center justify-between border-b border-cyan-500/20 bg-slate-950/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <h1 className="text-lg font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 uppercase">
            Debris Ops: Cascade
          </h1>
          <span className="text-xs px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 font-mono">
            LEVEL {level}/{MAX_LEVEL}
          </span>
        </div>

        <PlayerBadge />

        {/* Global Threat Warning Pulse */}
        {threatLevel > 75 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-950/60 border border-red-500/50 rounded-full animate-pulse text-red-400 text-xs font-semibold uppercase tracking-wider">
            <span>⚠️ Critical Cascade Imminent</span>
          </div>
        )}
      </header>

      {/* 3. Interactive HUD Sidebars */}
      <Sidebar />
      <TopThreats />
      <ControlPanel />
      <NoticeToasts />
      <PauseMenu />
      <StartScreen />
      <KeyboardControls />
      <SpamLaserToggle />
      <EndScreen />

      {/* 5. 3D WebGL Canvas */}
      <Canvas camera={{ position: [0, 8, 18], fov: 50 }}>
        {/* Soft, balanced space lighting */}
        <ambientLight intensity={0.95} />
        <directionalLight position={[12, 8, 6]} intensity={1.2} />
        <SimulationDriver />
        <SpaceBackground count={4000} />
        <Earth />

        {/* 1. ISS Model */}
        <Suspense fallback={null}>
          <ISS
  radius={ISS_ORBIT.radius}
  speed={ISS_ORBIT.speed}
  inclination={ISS_ORBIT.inclination}
  axisAngle={ISS_ORBIT.axisAngle}
  scale={0.02}
  initialAngle={ISS_ORBIT.initialAngle}
  showOrbit={true}
/>
        </Suspense>

        {/* 2. Custom GLTF Satellite 2 */}
        <Suspense fallback={null}>
          <SatelliteModel 
            modelPath="/satellite2.glb" 
            radius={6.8} 
            speed={0.3} 
            inclination={-Math.PI / 4} 
            axisAngle={Math.PI / 3}
            scale={0.0001} 
            initialAngle={Math.PI / 2}
            showOrbit={true}
            orbitColor="#ffffff"
          />
        </Suspense>

        {/* 3. Custom GLTF Hubble Space Telescope */}
        <Suspense fallback={null}>
          <SatelliteModel 
            modelPath="/hubble.glb" 
            radius={8.2} 
            speed={0.2} 
            inclination={Math.PI / 3} 
            axisAngle={(2 * Math.PI) / 3}
            scale={0.1} 
            initialAngle={Math.PI}
            showOrbit={true}
            orbitColor="#ffaa00"
          />
        </Suspense>

        {/* Dynamic, Clickable Debris Field */}
        <DynamicDebrisField />

        <OrbitControls 
          enableRotate={true} 
          enableZoom={true} 
          zoomSpeed={0.5} 
          minDistance={10}
          maxDistance={40}
          enablePan={false} 
        />
        <CameraKeyControls />
      </Canvas>
    </div>
  );
}

export default OrbitalScene;
