'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';

// Compact "Top 5 threats" list, pinned to the top-right corner (under the Pause button).
// It used to live inside the left Sidebar; the Risk-O-Meter stays there.
export default function TopThreats() {
  const debrisList = useGameStore((s) => s.debrisList);
  const selectedDebrisId = useGameStore((s) => s.selectedDebrisId);
  const selectDebris = useGameStore((s) => s.selectDebris);

  const top = debrisList
    .filter((d) => d.isHighRisk)
    .sort((a, b) => b.riskPercentage - a.riskPercentage)
    .slice(0, 5);

  return (
    <aside className="absolute top-20 right-6 w-52 z-20 pointer-events-auto">
      <div className="bg-slate-950/70 backdrop-blur-xl border border-red-500/30 rounded-xl p-2.5 text-slate-100 shadow-[0_0_20px_rgba(255,60,60,0.08)]">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-red-400">⚠ Top 5 Threats</h3>
        </div>

        <div className="space-y-1 font-mono">
          {top.length === 0 ? (
            <div className="text-center py-3 text-[10px] text-slate-500">NO THREATS DETECTED</div>
          ) : (
            top.map((item) => {
              const isSelected = selectedDebrisId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => selectDebris(item.id)}
                  className={`w-full flex items-center justify-between rounded-md border px-2 py-1 text-left text-[10px] transition ${
                    isSelected
                      ? 'bg-cyan-950/80 border-cyan-400 text-white'
                      : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:border-slate-600 hover:bg-slate-900/80'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-cyan-400 animate-ping' : 'bg-red-500'}`} />
                    <span className="font-semibold">{item.id}</span>
                  </span>
                  <span className="font-bold text-red-400">{item.riskPercentage}%</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
