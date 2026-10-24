'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';

const STYLES = {
  success: 'border-emerald-400/50 text-emerald-200',
  miss: 'border-red-400/50 text-red-200',
  warn: 'border-amber-400/50 text-amber-200',
  info: 'border-cyan-400/50 text-cyan-200',
};
const ICONS = { success: '✔', miss: '✖', warn: '⚠', info: 'ℹ' };

// Semi-transparent popups that replace alert(). Click-through (pointer-events-none),
// so they never block aiming at debris.
export default function NoticeToasts() {
  const notices = useGameStore((s) => s.notices);

  return (
    <div className="absolute top-60 left-6 z-40 flex flex-col items-start gap-2 pointer-events-none">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`notice-pop flex items-center gap-2 px-5 py-2.5 rounded-xl border bg-slate-950/45 backdrop-blur-md shadow-lg font-mono text-sm font-semibold tracking-wider uppercase ${
            STYLES[n.type] ?? STYLES.info
          }`}
          style={{ animationDuration: `${n.duration}ms` }}
        >
          <span>{ICONS[n.type] ?? ICONS.info}</span>
          <span>{n.message}</span>
        </div>
      ))}
    </div>
  );
}
