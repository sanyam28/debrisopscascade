'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';

// Pause button (top-right) + the pause popup: Resume Level / Restart Level / Exit Game.
export default function PauseMenu() {
  const gameState = useGameStore((s) => s.gameState);
  const pauseGame = useGameStore((s) => s.pauseGame);
  const resumeGame = useGameStore((s) => s.resumeGame);
  const restartLevel = useGameStore((s) => s.restartLevel);
  const exitToMenu = useGameStore((s) => s.exitToMenu);

  return (
    <>
      {gameState === 'PLAYING' && (
        <button
          onClick={pauseGame}
          aria-label="Pause game"
          title="Pause (Esc)"
          className="absolute top-3 right-6 z-30 flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-slate-950/70 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-cyan-300 backdrop-blur-md transition hover:border-cyan-400 hover:bg-slate-900"
        >
          <span aria-hidden="true">❚❚</span> Pause
        </button>
      )}

      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-2xl border border-cyan-500/30 bg-slate-950/85 p-8 text-center shadow-2xl backdrop-blur-md">
            <h2 className="mb-6 text-2xl font-black uppercase tracking-widest text-cyan-300">Paused</h2>

            <div className="flex flex-col gap-3">
              <button
                onClick={resumeGame}
                className="rounded-xl bg-cyan-500 py-3 text-sm font-bold uppercase tracking-wider text-slate-950 transition hover:bg-cyan-400"
              >
                Resume Level
              </button>
              <button
                onClick={restartLevel}
                className="rounded-xl border border-slate-600 bg-slate-900 py-3 text-sm font-bold uppercase tracking-wider text-slate-100 transition hover:border-slate-400"
              >
                Restart Level
              </button>
              <button
                onClick={exitToMenu}
                className="rounded-xl border border-red-500/40 bg-red-950/40 py-3 text-sm font-bold uppercase tracking-wider text-red-300 transition hover:border-red-400"
              >
                Exit Game
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
