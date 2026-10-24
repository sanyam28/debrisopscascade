'use client';

import React, { useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { Shield, AlertTriangle, Crosshair, Zap, Radio } from 'lucide-react';

export function HUDOverlay() {
  const riskMeter = useGameStore((state) => state.riskMeter);
  const debris = useGameStore((state) => state.debris);
  const selectedDebrisId = useGameStore((state) => state.selectedDebrisId);
  const selectedWeapon = useGameStore((state) => state.selectedWeapon);
  const missilesLeft = useGameStore((state) => state.missilesLeft);
  const selectWeapon = useGameStore((state) => state.selectWeapon);
  const fireWeapon = useGameStore((state) => state.fireWeapon);
  const gameStatus = useGameStore((state) => state.gameStatus);

  const [log, setLog] = useState('Tactical grid online. Target high-risk debris.');

  const topRisks = [...debris]
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 5);

  const handleFire = () => {
    const res = fireWeapon();
    setLog(res.resultText);
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
      {/* Top Threat Gauge */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-4 rounded-lg text-white max-w-md">
          <div className="flex items-center gap-2 text-red-400 font-mono text-sm font-bold uppercase tracking-wider mb-1">
            <AlertTriangle className="w-4 h-4" /> Risk-O-Meter
          </div>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black font-mono">{riskMeter}%</div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
              <div
                className={`h-full transition-all duration-300 ${
                  riskMeter <= 25 ? 'bg-emerald-500' : riskMeter < 60 ? 'bg-yellow-500' : 'bg-red-600'
                }`}
                style={{ width: `${Math.min(100, riskMeter)}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-1">Goal: Cut risk to 25% or below</div>
        </div>

        {/* Status Badge */}
        <div className="bg-slate-900/80 backdrop-blur border border-slate-700 px-6 py-3 rounded-lg text-white font-mono">
          <span className="text-xs text-slate-400 block">STATUS</span>
          <span
            className={`text-lg font-bold ${
              gameStatus === 'PLAYING'
                ? 'text-cyan-400'
                : gameStatus === 'WON'
                ? 'text-emerald-400'
                : 'text-red-500'
            }`}
          >
            {gameStatus}
          </span>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="grid grid-cols-12 gap-6 pointer-events-auto items-end">
        {/* Top 5 High-Risk Targets */}
        <div className="col-span-3 bg-slate-900/85 backdrop-blur border border-slate-800 p-4 rounded-xl text-white font-mono">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" /> Critical Threats
          </h3>
          <div className="space-y-2">
            {topRisks.map((d) => (
              <div
                key={d.id}
                className={`p-2 rounded border flex justify-between items-center text-xs cursor-pointer transition ${
                  selectedDebrisId === d.id
                    ? 'border-cyan-400 bg-cyan-950/40'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                }`}
                onClick={() => useGameStore.getState().selectDebris(d.id)}
              >
                <div>
                  <div className="font-bold text-slate-200">{d.name}</div>
                  <div className="text-[10px] text-slate-500">{d.layer} Orbit</div>
                </div>
                <div className={`font-bold ${d.risk > 60 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {d.risk}% Risk
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tactical Launch Console */}
        <div className="col-span-6 bg-slate-900/90 backdrop-blur border border-slate-700 p-5 rounded-xl text-white">
          <div className="text-xs font-mono text-slate-400 mb-3 flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" /> Mission Log: <span className="text-slate-200">{log}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 flex-1">
              <button
                className={`flex-1 py-2 px-3 rounded-md font-mono text-xs font-bold flex items-center justify-center gap-2 transition ${
                  selectedWeapon === 'MISSILE' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                onClick={() => selectWeapon('MISSILE')}
              >
                <Crosshair className="w-4 h-4" /> Missile ({missilesLeft})
              </button>
              <button
                className={`flex-1 py-2 px-3 rounded-md font-mono text-xs font-bold flex items-center justify-center gap-2 transition ${
                  selectedWeapon === 'LASER' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                onClick={() => selectWeapon('LASER')}
              >
                <Zap className="w-4 h-4" /> Laser
              </button>
            </div>

            <button
              disabled={!selectedDebrisId || gameStatus !== 'PLAYING'}
              onClick={handleFire}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-mono font-black px-8 py-3 rounded-lg shadow-lg shadow-red-950/50 uppercase tracking-widest text-sm transition"
            >
              ENGAGE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
