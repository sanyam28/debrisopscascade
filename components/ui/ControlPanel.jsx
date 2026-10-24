'use client';

import React from 'react';
import { useGameStore, ACTION_TIMEOUT_SECONDS, MISSILE_COOLDOWN_SECONDS } from '../../store/useGameStore';
import { useProfileStore } from '../../store/useProfileStore';
import { BOMB_UNLOCK_LEVEL, BOMB_COST, BOMB_TARGETS, pointsPerDebris } from '../../utils/levels';

export default function ControlPanel() {
  const selectedDebrisId = useGameStore((s) => s.selectedDebrisId);
  const missileLaunchesLeft = useGameStore((s) => s.missileLaunchesLeft);
  const cfg = useGameStore((s) => s.levelConfig); // this level's hit / effect chances
  const timeToCollision = useGameStore((s) => s.timeToCollision);
  // rounded up to whole seconds so this only re-renders once a second, not every frame
  const missileCooldown = useGameStore((s) => Math.ceil(s.missileCooldown));
  const reloading = missileCooldown > 0;
  const fireMissile = useGameStore((s) => s.fireMissile);
  const fireLaser = useGameStore((s) => s.fireLaser);
  const spamLaser = useGameStore((s) => s.spamLaser);
  const laserCooling = useGameStore((s) => !s.spamLaser && s.laserCooldown > 0); // boolean => re-renders only when it flips
  const level = useGameStore((s) => s.level);
  const bombsLeft = useGameStore((s) => s.bombsLeft);
  const bombPending = useGameStore((s) => s.bombPending);
  const fireBomb = useGameStore((s) => s.fireBomb);
  const buyBomb = useGameStore((s) => s.buyBomb);
  const debrisCleared = useGameStore((s) => s.debrisCleared);
  const points = useProfileStore((s) => s.points);
  const bombUnlocked = level >= BOMB_UNLOCK_LEVEL;
  const canBuyBomb = points >= BOMB_COST;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-md border border-cyan-500/30 p-4 rounded-2xl text-white shadow-2xl flex gap-6 items-center z-10">
      {/* Target Status */}
      <div className="border-r border-slate-800 pr-6">
        <p className="text-xs text-slate-400 uppercase font-semibold">Active Target</p>
        <p className="font-mono text-lg text-cyan-300">
          {selectedDebrisId ? selectedDebrisId : 'SELECT DEBRIS'}
        </p>
        {/* Live score for this run: paid out when the level is cleared */}
        <p className="text-[10px] font-mono text-amber-300/80 mt-1">
          Cleared {debrisCleared} x {pointsPerDebris(level)} = {debrisCleared * pointsPerDebris(level)} pts
        </p>
      </div>

      {/* Telemetry Timer */}
      <div className="border-r border-slate-800 pr-6 text-center w-40">
  <p className="text-xs text-slate-400 uppercase font-semibold">Collision Window</p>
  <p
    className={`font-mono text-lg font-bold ${
      timeToCollision <= 10
        ? 'text-red-400 animate-pulse'
        : timeToCollision <= 20
        ? 'text-amber-400'
        : 'text-emerald-400'
    }`}
  >
    {timeToCollision}s
  </p>
  {/* Time-left bar: drains while idle, refills when a weapon is fired */}
  <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
    <div
      className={`h-full transition-all duration-1000 ease-linear ${
        timeToCollision <= 10 ? 'bg-red-500' : timeToCollision <= 20 ? 'bg-amber-400' : 'bg-emerald-400'
      }`}
      style={{ width: `${(timeToCollision / ACTION_TIMEOUT_SECONDS) * 100}%` }}
    />
  </div>
  <p className="text-[10px] text-slate-500 mt-1">Fire a weapon to reset</p>
</div>

      {/* Clearance Actions */}
      <div className="flex gap-3">
        {/* Kinetic Missile */}
        <button
          onClick={fireMissile}
          disabled={!selectedDebrisId || missileLaunchesLeft <= 0 || reloading}
          className="relative overflow-hidden px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white rounded-lg font-bold text-sm tracking-wide shadow-lg transition"
        >
          {reloading ? `Reloading... ${missileCooldown}s` : `Missile (${missileLaunchesLeft} Left)`}
          <span className="block text-[10px] font-normal opacity-80">
            {Math.round(cfg.missileHitChance * 100)}% Hit | {Math.round(cfg.missileDestroyChance * 100)}% Destroy
          </span>
          <span className="block text-[10px] font-mono font-normal text-amber-200/80">[Space]</span>
          {/* Reload bar: drains over the cooldown */}
          {reloading && (
            <div
              className="absolute bottom-0 left-0 h-1 bg-amber-300 transition-all duration-1000 ease-linear"
              style={{ width: `${(missileCooldown / MISSILE_COOLDOWN_SECONDS) * 100}%` }}
            />
          )}
        </button>

        {/* Tactical Laser */}
        <button
          onClick={fireLaser}
          disabled={!selectedDebrisId || laserCooling}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:hover:bg-cyan-600 text-white rounded-lg font-bold text-sm tracking-wide shadow-lg transition"
        >
          {laserCooling ? 'Recharging...' : spamLaser ? 'Laser Nudge (SPAM)' : 'Laser Nudge (∞)'}
          <span className="block text-[10px] font-normal opacity-80">
            {Math.round(cfg.laserHitChance * 100)}% Hit | {Math.round(cfg.laserNudgeChance * 100)}% Nudge
          </span>
          <span className="block text-[10px] font-mono font-normal text-cyan-100/80">[Double-tap debris]</span>
        </button>

        {/* Bomb (level 7+): fire it while you have one; once it is used, buy another for BOMB_COST pts */}
        {bombUnlocked && (bombsLeft > 0 ? (
          <button
            onClick={fireBomb}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold text-sm tracking-wide shadow-lg transition"
          >
            Bomb ({bombsLeft} Left)
            <span className="block text-[10px] font-normal opacity-80">
              Clears {BOMB_TARGETS} nearest the satellite
            </span>
            <span className="block text-[10px] font-mono font-normal text-orange-100/80">[B]</span>
          </button>
        ) : (
          <button
            onClick={buyBomb}
            disabled={bombPending || !canBuyBomb}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-700 text-white rounded-lg font-bold text-sm tracking-wide shadow-lg transition"
          >
            {bombPending ? 'Buying...' : `Buy Bomb (${BOMB_COST} pts)`}
            <span className="block text-[10px] font-normal opacity-80">
              {canBuyBomb ? 'Bomb used - restock' : `Need ${BOMB_COST - points} more pts`}
            </span>
            <span className="block text-[10px] font-mono font-normal text-amber-100/80">You have {points.toLocaleString()} pts</span>
          </button>
        ))}
      </div>
    </div>
  );
}
