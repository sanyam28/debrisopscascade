'use client';

import React from 'react';
import { useGameStore, LASER_COOLDOWN_SECONDS } from '../../store/useGameStore';

// Bottom-right switch. OFF = laser reloads for 1s after every shot. ON = fire as fast as you can click.
export default function SpamLaserToggle() {
  const spamLaser = useGameStore((s) => s.spamLaser);
  const setSpamLaser = useGameStore((s) => s.setSpamLaser);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={spamLaser}
      onClick={() => setSpamLaser(!spamLaser)}
      title={spamLaser ? 'No laser cooldown' : `Laser cooldown: ${LASER_COOLDOWN_SECONDS}s`}
      className={`absolute bottom-6 right-6 z-20 flex items-center gap-2.5 rounded-xl border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest backdrop-blur-md transition ${
        spamLaser
          ? 'border-cyan-400/70 bg-cyan-950/60 text-cyan-200 shadow-[0_0_18px_rgba(0,242,255,0.25)]'
          : 'border-slate-600/60 bg-slate-950/70 text-slate-400 hover:border-slate-400'
      }`}
    >
      <span>Spam Laser Mode</span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 rounded-full transition ${spamLaser ? 'bg-cyan-500' : 'bg-slate-700'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${spamLaser ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
