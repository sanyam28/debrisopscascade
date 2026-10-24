'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useProfileStore } from '../../store/useProfileStore';
import { MAX_LEVEL } from '../../utils/levels';

// Victory / game-over popup. On victory it also awards the level's points (once per run).
export default function EndScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const gameOverReason = useGameStore((s) => s.gameOverReason);
  const level = useGameStore((s) => s.level);
  const runId = useGameStore((s) => s.runId);
  const debrisCleared = useGameStore((s) => s.debrisCleared);
  const restartLevel = useGameStore((s) => s.restartLevel);
  const nextLevel = useGameStore((s) => s.nextLevel);
  const exitToMenu = useGameStore((s) => s.exitToMenu);

  const completeLevel = useProfileStore((s) => s.completeLevel);
  const totalPoints = useProfileStore((s) => s.points);

  const [award, setAward] = useState(null);
  const awardedRun = useRef(null);

  useEffect(() => {
    if (gameState !== 'VICTORY') {
      setAward(null);
      return;
    }
    if (awardedRun.current === runId) return; // already paid out for this run (StrictMode-safe)
    awardedRun.current = runId;
    // The server pays out debrisCleared x (10 + 5 per level) points and signs the new total.
    completeLevel(level, debrisCleared).then(setAward);
  }, [gameState, runId, level, debrisCleared, completeLevel]);

  if (gameState !== 'VICTORY' && gameState !== 'GAME_OVER') return null;
  const won = gameState === 'VICTORY';
  const lastLevel = level >= MAX_LEVEL;

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-6 text-center">
      <div
        className={`p-8 rounded-2xl border max-w-lg w-full backdrop-blur-md shadow-2xl ${
          won ? 'bg-slate-950/80 border-emerald-500/40 shadow-emerald-500/10' : 'bg-slate-950/80 border-red-500/40 shadow-red-500/10'
        }`}
      >
        <p className="mb-2 text-xs font-mono uppercase tracking-[0.4em] text-cyan-400">
          Level {level} / {MAX_LEVEL}
        </p>

        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-5 ${
            won ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          <span className="text-2xl">{won ? '🛡️' : '💥'}</span>
        </div>

        <h2 className="text-3xl font-extrabold tracking-wide mb-2">
          {won
            ? lastLevel
              ? 'ALL SECTORS SECURED'
              : 'STABILITY ACHIEVED'
            : gameOverReason === 'COLLISION'
            ? 'DEBRIS COLLISION'
            : 'KESSLER CASCADE'}
        </h2>

        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          {won
            ? 'Orbital threat density reduced below critical threshold (25%). Operational assets successfully secured.'
            : gameOverReason === 'COLLISION'
            ? 'No action was taken within the collision window. Debris struck the station and triggered an uncontrolled chain reaction.'
            : 'Debris collision threshold reached 100%. Uncontrolled chain reaction destroyed all active satellite infrastructure.'}
        </p>

        {won && award && (
          <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-950/20 px-4 py-3 font-mono">
            {award.reset ? (
              <p className="text-xs uppercase tracking-wider text-red-400">Save data failed verification - progress reset to Level 1</p>
            ) : award.offline ? (
              <p className="text-xs uppercase tracking-wider text-slate-400">Server unreachable - points not saved</p>
            ) : award.repeat && award.points === 0 ? (
              <p className="text-xs uppercase tracking-wider text-slate-400">Level already cleared - no points awarded</p>
            ) : (
              <>
                <p className="text-lg font-bold text-amber-300">+{award.points.toLocaleString()} pts</p>
                {/* <p className="text-[11px] uppercase tracking-wider text-slate-400">
                  {award.debrisCleared} debris x {award.perDebris} pts{award.repeat ? ' (replay)' : ''}
                </p> */}
              </>
            )}
            <p className="text-[11px] uppercase tracking-wider text-slate-400 mt-1">
              Total: <span className="text-amber-200">{totalPoints.toLocaleString()} pts</span>
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {won && !lastLevel && (
            <button
              onClick={nextLevel}
              className="w-full py-3.5 px-6 rounded-xl font-bold tracking-wider uppercase text-sm transition-all duration-300 shadow-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25"
            >
              Next Level ({level + 1})
            </button>
          )}
          {!won && (
            <button
              onClick={restartLevel}
              className="w-full py-3.5 px-6 rounded-xl font-bold tracking-wider uppercase text-sm transition-all duration-300 shadow-lg bg-red-600 hover:bg-red-500 text-white shadow-red-600/25"
            >
              Retry Level {level}
            </button>
          )}
          {won && (
            <button
              onClick={restartLevel}
              className="w-full py-3 px-6 rounded-xl border border-slate-600 bg-slate-900 font-bold tracking-wider uppercase text-sm text-slate-100 transition hover:border-slate-400"
            >
              Replay Level {level}
            </button>
          )}
          <button
            onClick={exitToMenu}
            className="w-full py-3 px-6 rounded-xl border border-slate-700 bg-transparent font-bold tracking-wider uppercase text-xs text-slate-400 transition hover:text-slate-200"
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
