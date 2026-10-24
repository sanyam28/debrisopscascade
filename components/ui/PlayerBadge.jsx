'use client';

import React from 'react';
import { useProfileStore } from '../../store/useProfileStore';

// Player id + total points, shown in the header bar.
export default function PlayerBadge() {
  const playerId = useProfileStore((s) => s.playerId);
  const points = useProfileStore((s) => s.points);

  if (!playerId) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-cyan-500/20 bg-slate-950/50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider">
      <span className="text-slate-400">
        Pilot <span className="text-cyan-300">{playerId}</span>
      </span>
      <span className="h-3 w-px bg-slate-700" />
      <span className="text-amber-300 font-bold">{points.toLocaleString()} pts</span>
    </div>
  );
}
