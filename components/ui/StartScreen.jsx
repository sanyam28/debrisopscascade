'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useProfileStore } from '../../store/useProfileStore';
import { MAX_LEVEL } from '../../utils/levels';

// Title window shown on first load (and after "Exit Game" / "Main Menu"). The live game interface
// stays visible behind it, darkened. Satellites and debris keep moving; the game clock is frozen.
export default function StartScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const level = useGameStore((s) => s.level);
  const cfg = useGameStore((s) => s.levelConfig);
  const startGame = useGameStore((s) => s.startGame);
  const selectLevel = useGameStore((s) => s.selectLevel);

  const playerId = useProfileStore((s) => s.playerId);
  const points = useProfileStore((s) => s.points);
  const clearedLevels = useProfileStore((s) => s.clearedLevels);
  const tampered = useProfileStore((s) => s.tampered);

  if (gameState !== 'START') return null;

  // Levels unlock one at a time: you may pick any cleared level, plus the next one.
  const unlocked = Math.min(MAX_LEVEL, (clearedLevels.length ? Math.max(...clearedLevels) : 0) + 1);
  const cleared = clearedLevels.includes(level);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/55 px-6 text-center">
      {tampered && (
        <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-red-400">
          Save data was modified - progress reset to Level 1
        </p>
      )}
      {playerId && (
        <p className="mb-6 font-mono text-[11px] uppercase tracking-widest text-slate-400">
          Pilot <span className="text-cyan-300">{playerId}</span> &middot;{' '}
          <span className="text-amber-300">{points.toLocaleString()} pts</span>
        </p>
      )}

      {/* Level picker */}
      <div className="mb-3 flex items-center gap-4">
        <button
          onClick={() => selectLevel(level - 1)}
          disabled={level <= 1}
          aria-label="Previous level"
          className="h-8 w-8 rounded-lg border border-cyan-500/40 font-mono text-cyan-300 transition hover:bg-slate-900 disabled:opacity-30"
        >
          &#9664;
        </button>
        <p className="min-w-40 text-xs font-mono uppercase tracking-[0.4em] text-cyan-400">
          Level {level} / {MAX_LEVEL}
          {cleared && <span className="ml-2 text-emerald-400">&#10003;</span>}
        </p>
        <button
          onClick={() => selectLevel(level + 1)}
          disabled={level >= unlocked}
          aria-label="Next level"
          className="h-8 w-8 rounded-lg border border-cyan-500/40 font-mono text-cyan-300 transition hover:bg-slate-900 disabled:opacity-30"
        >
          &#9654;
        </button>
      </div>

      <h1 className="mb-4 text-5xl md:text-6xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400">
        Debris Ops: Cascade
      </h1>

      <p className="mb-6 max-w-md text-sm leading-relaxed text-slate-300">
        Two satellites have collided. The debris field is growing. Clear the high-risk
        fragments before the cascade begins.
      </p>

      {/* This level's numbers */}
      <div className="mb-8 flex flex-wrap justify-center gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">
        <span><span className="text-cyan-300">{cfg.debrisCount}</span> debris</span>
        <span><span className="text-cyan-300">{cfg.missiles}</span> missiles</span>
        <span><span className="text-cyan-300">{cfg.speedMult.toFixed(2)}x</span> speed</span>
        <span><span className="text-cyan-300">{Math.round(cfg.laserHitChance * 100)}%</span> laser hit</span>
      </div>

      <button
        onClick={startGame}
        className="rounded-xl bg-cyan-500 px-12 py-4 text-lg font-black uppercase tracking-widest text-slate-950 shadow-[0_0_30px_rgba(0,242,255,0.35)] transition hover:bg-cyan-400 hover:shadow-[0_0_45px_rgba(0,242,255,0.55)]"
      >
        Start Mission
      </button>

      <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 text-[11px] font-mono uppercase tracking-wider text-slate-400">
        <span><span className="text-cyan-300">Click</span> select</span>
        <span><span className="text-cyan-300">Click again</span> laser</span>
        <span><span className="text-cyan-300">Space</span> missile</span>
        <span><span className="text-cyan-300">W A S D</span> camera</span>
        <span><span className="text-cyan-300">B</span> bomb (lvl 7+)</span>
        <span><span className="text-cyan-300">Esc</span> pause</span>
      </div>
    </div>
  );
}
