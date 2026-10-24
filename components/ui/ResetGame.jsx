'use client';

import React, { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useProfileStore } from '../../store/useProfileStore';

// "Reset Game" button + confirmation dialog. Wipes the saved profile (points, cleared levels and the
// signed token in localStorage), creates a brand-new level-1 profile and returns to Level 1's briefing.
export default function ResetGame() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const doReset = async () => {
    if (busy) return;
    setBusy(true);
    await useProfileStore.getState().resetProfile();
    useGameStore.getState().initLevel(useProfileStore.getState().getNextLevel(), 'START');
    setBusy(false);
    setConfirming(false);
  };

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="mt-6 rounded-lg border border-red-500/40 bg-red-950/30 px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-red-300 transition hover:border-red-400 hover:bg-red-950/60"
      >
        Reset Game
      </button>

      {confirming && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="reset-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-6"
          onKeyDown={(e) => e.key === 'Escape' && !busy && setConfirming(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-red-500/40 bg-slate-950/95 p-8 text-center shadow-2xl">
            <h2 id="reset-title" className="mb-3 text-xl font-black uppercase tracking-widest text-red-400">
              Reset game?
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-slate-300">
              Are you sure you want to reset your game? This action will lose all your points and progress.
              It cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                autoFocus
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="flex-1 rounded-xl border border-slate-600 bg-slate-900 py-3 text-sm font-bold uppercase tracking-wider text-slate-100 transition hover:border-slate-400 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={doReset}
                disabled={busy}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {busy ? 'Resetting...' : 'Yes, reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
