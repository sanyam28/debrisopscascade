'use client';

import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import {
  useCameraSettings, SENSITIVITY_MIN, SENSITIVITY_MAX, SENSITIVITY_STEP,
} from '../../store/useCameraSettings';

const ROWS = [
  { code: 'KeyW', label: 'W', hint: 'Tilt up' },
  { code: 'KeyA', label: 'A', hint: 'Orbit left' },
  { code: 'KeyS', label: 'S', hint: 'Tilt down' },
  { code: 'KeyD', label: 'D', hint: 'Orbit right' },
];

function Slider({ label, hint, value, onChange, accent, dim = false }) {
  return (
    <label className={`flex items-center gap-2 transition-opacity ${dim ? 'opacity-40' : ''}`} title={hint}>
      <span className={`w-12 font-mono text-[10px] font-bold uppercase tracking-widest ${accent}`}>{label}</span>
      <input
        type="range"
        min={SENSITIVITY_MIN}
        max={SENSITIVITY_MAX}
        step={SENSITIVITY_STEP}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={(e) => e.currentTarget.blur()} // give the keyboard back to WASD after dragging
        className="h-1 flex-1 cursor-pointer accent-cyan-400"
      />
      <span className="w-10 text-right font-mono text-[10px] text-slate-300">{value.toFixed(2)}x</span>
    </label>
  );
}

// Bottom-left panel: master slider (sets all keys) + one slider per key (W A S D).
// Only available on the title / level-briefing screen and while paused - never mid-mission.
export default function CameraSensitivity() {
  const [open, setOpen] = useState(false);
  const master = useCameraSettings((s) => s.master);
  const keys = useCameraSettings((s) => s.keys);
  const linked = useCameraSettings((s) => s.linked);
  const setLinked = useCameraSettings((s) => s.setLinked);
  const setMaster = useCameraSettings((s) => s.setMaster);
  const setKey = useCameraSettings((s) => s.setKey);
  const reset = useCameraSettings((s) => s.reset);
  const hydrate = useCameraSettings((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  const gameState = useGameStore((s) => s.gameState);
  if (gameState !== 'START' && gameState !== 'PAUSED') return null;

  return (
    <div className="absolute bottom-6 left-6 z-[55] w-64 rounded-xl border border-slate-600/60 bg-slate-950/75 font-mono text-[10px] uppercase tracking-widest text-slate-300 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 font-bold text-cyan-300 hover:text-cyan-200"
      >
        <span>Camera Sensitivity</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-slate-700/60 px-3 pb-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400">Overall sensitivity</span>
            <button
              type="button"
              role="switch"
              aria-checked={linked}
              onClick={() => setLinked(!linked)}
              title={linked ? 'Overall is controlling all keys (change a key to switch it off)' : 'Click to apply overall value to every key'}
              className={`rounded-full border px-2 py-0.5 text-[9px] font-bold transition ${
                linked ? 'border-amber-400/70 bg-amber-950/50 text-amber-300' : 'border-slate-600 text-slate-500 hover:border-slate-400'
              }`}
            >
              {linked ? 'On' : 'Off'}
            </button>
          </div>
          <Slider label="All" hint="Sets every key to this value (turns overall ON)" value={master} onChange={setMaster} accent="text-amber-300" dim={!linked} />
          <div className="my-0.5 h-px bg-slate-700/60" />
          {ROWS.map((r) => (
            <Slider
              key={r.code}
              label={r.label}
              hint={r.hint}
              value={keys[r.code]}
              onChange={(v) => setKey(r.code, v)}
              accent="text-cyan-300"
            />
          ))}
          <button
            type="button"
            onClick={reset}
            className="mt-1 self-end rounded border border-slate-600 px-2 py-1 text-[9px] text-slate-400 transition hover:border-slate-400 hover:text-slate-200"
          >
            Reset to 1.00x
          </button>
        </div>
      )}
    </div>
  );
}
