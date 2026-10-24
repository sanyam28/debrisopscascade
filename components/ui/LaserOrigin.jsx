'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { getAimScreen, isAimBlocked, onLaserShot } from '../../utils/aim';

// Highlights WHERE THE LASER STARTS: the camera (your viewpoint). The ray is cast from the
// camera towards the debris, so this marker stands in for the camera on screen:
//   cyan  = ready               amber = target hidden behind Earth (no line of sight)
//   slate = recharging          (hidden entirely until a debris is selected)
// Every real shot also flashes a beam from the marker: into the target on a hit, and
// passing beside it (and on past) on a miss, so a miss really looks like a miss.
// Purely visual: pointer-events-none, so it never blocks clicks on the 3D scene.

const BEAM_MS = 280;
const MISS_OFFSET_PX = [55, 95]; // a missed beam passes this many screen pixels beside the target
const MISS_EXTEND = 1.7;         // ...and keeps going this far past it (1 = would end at the target)

const STATUS = {
  ready: {
    label: 'Laser Origin · Camera',
    ring: 'bg-cyan-400',
    core: 'border-cyan-200 bg-cyan-400 shadow-[0_0_14px_3px_rgba(34,211,238,0.8)]',
    tag: 'border-cyan-400/50 bg-cyan-950/70 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.35)]',
  },
  blocked: {
    label: 'No Line of Sight',
    ring: 'bg-amber-400',
    core: 'border-amber-200 bg-amber-400 shadow-[0_0_14px_3px_rgba(251,191,36,0.8)]',
    tag: 'border-amber-400/60 bg-amber-950/70 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.35)]',
  },
  cooling: {
    label: 'Laser Recharging',
    ring: 'bg-slate-400',
    core: 'border-slate-300 bg-slate-500 shadow-[0_0_10px_2px_rgba(148,163,184,0.5)]',
    tag: 'border-slate-500/60 bg-slate-900/70 text-slate-300',
  },
};

export default function LaserOrigin() {
  const playing = useGameStore((s) => s.gameState === 'PLAYING');
  const hasTarget = useGameStore((s) => !!s.selectedDebrisId);
  const cooling = useGameStore((s) => !s.spamLaser && s.laserCooldown > 0); // boolean => re-renders only when it flips

  const rootRef = useRef(null);
  const markerRef = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const [beam, setBeam] = useState(null); // { x1, y1, x2, y2, id } while a beam is showing

  // Poll the (non-reactive) aim state each frame; only touch React state when it flips.
  useEffect(() => {
    let raf;
    const loop = () => {
      const b = isAimBlocked();
      setBlocked((prev) => (prev === b ? prev : b));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Flash a beam from the marker to the target every time the laser fires.
  useEffect(() => {
    let timer;
    const off = onLaserShot((outcome) => {
      const root = rootRef.current;
      const marker = markerRef.current;
      const target = getAimScreen();
      if (!root || !marker || !target?.visible) return;
      const rr = root.getBoundingClientRect();
      const mr = marker.getBoundingClientRect();
      const x1 = mr.left - rr.left + mr.width / 2;
      const y1 = mr.top - rr.top + mr.height / 2;
      const id = performance.now();

      let x2 = target.x;
      let y2 = target.y;
      const missed = outcome === 'MISS';
      if (missed) {
        // Aim at a point beside the target (random side), then run the beam on past it,
        // so it visibly sails by instead of hitting.
        const dx = target.x - x1;
        const dy = target.y - y1;
        const dist = Math.hypot(dx, dy) || 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const o = (MISS_OFFSET_PX[0] + Math.random() * (MISS_OFFSET_PX[1] - MISS_OFFSET_PX[0])) * side;
        const ax = target.x + (-dy / dist) * o;
        const ay = target.y + (dx / dist) * o;
        x2 = x1 + (ax - x1) * MISS_EXTEND;
        y2 = y1 + (ay - y1) * MISS_EXTEND;
      }

      setBeam({ x1, y1, x2, y2, missed, id });
      clearTimeout(timer);
      timer = setTimeout(() => setBeam((cur) => (cur && cur.id === id ? null : cur)), BEAM_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  if (!playing || !hasTarget) return null;

  const st = STATUS[blocked ? 'blocked' : cooling ? 'cooling' : 'ready'];

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10">
      {/* Beam: bright core + soft glow, only for a moment after each shot */}
      {beam && (
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          <line
            x1={beam.x1} y1={beam.y1} x2={beam.x2} y2={beam.y2}
            className="stroke-cyan-300/40" strokeWidth="9" strokeLinecap="round"
          />
          <line
            x1={beam.x1} y1={beam.y1} x2={beam.x2} y2={beam.y2}
            className="animate-pulse stroke-white" strokeWidth="2.5" strokeLinecap="round"
          />
          {/* impact flash only when the beam actually hits the target */}
          {!beam.missed && <circle cx={beam.x2} cy={beam.y2} r="10" className="animate-ping fill-cyan-300/60" />}
        </svg>
      )}

      {/* The origin marker: pulsing ring + glowing core + label */}
      <div className="absolute bottom-44 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <span ref={markerRef} className="relative flex h-7 w-7 items-center justify-center">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${st.ring}`} />
          <span className={`relative inline-flex h-3.5 w-3.5 rounded-full border-2 ${st.core}`} />
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest backdrop-blur-sm ${st.tag}`}
        >
          {st.label}
        </span>
      </div>
    </div>
  );
}
