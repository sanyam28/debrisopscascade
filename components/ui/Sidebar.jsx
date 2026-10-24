'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';

export default function Sidebar() {
  const threatLevel = useGameStore((s) => s.threatLevel);

  return (
    <aside className="absolute top-20 left-6 w-84 z-20 pointer-events-auto">
      <div className="bg-slate-950/70 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-5 text-slate-100 shadow-[0_0_30px_rgba(0,242,255,0.08)]">
        
        {/* Section 1: Header & Threat Meter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-widest text-cyan-400 uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Risk-O-Meter
            </span>
            <span className={`font-mono text-sm font-black ${
              threatLevel <= 25 
                ? 'text-emerald-400' 
                : threatLevel > 75 
                ? 'text-red-400 animate-pulse' 
                : 'text-amber-400'
            }`}>
              {threatLevel}%
            </span>
          </div>

          {/* Progress Bar Container */}
          <div className="relative w-full h-3 bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-slate-800">
            {/* Target 25% Threshold Indicator Line */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400/80 z-10 shadow-[0_0_8px_#00f2ff]" 
              style={{ left: '25%' }}
              title="Target Threshold (25%)"
            />

            <div
              className={`h-full rounded-full transition-all duration-700 ease-out shadow-lg ${
                threatLevel <= 25
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-emerald-500/50'
                  : threatLevel > 75
                  ? 'bg-gradient-to-r from-red-600 to-amber-500 shadow-red-500/50'
                  : 'bg-gradient-to-r from-amber-600 to-yellow-400 shadow-amber-500/50'
              }`}
              style={{ width: `${Math.min(100, threatLevel)}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1.5 px-0.5">
            <span>SAFE: &le;25%</span>
            <span>CASCADE: 100%</span>
          </div>
        </div>

      </div>
    </aside>
  );
}
