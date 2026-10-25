'use client';

import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { onLaserShot } from '../utils/aim';
import { onMissileShot, onBombShot, BOMB_FLIGHT_SECONDS, BOMB_RADIATE_SECONDS } from '../utils/missileFx';
import { loadSoundSettings, preloadSounds, playSound, playMusic, pauseMusic, stopMusic } from '../utils/sound';

// Renders nothing. Listens to the game (store changes + laser / missile / bomb events) and plays the sounds
// defined in utils/sound.js. Add the .mp3 files to public/sounds/.
export default function SoundManager() {
  useEffect(() => {
    loadSoundSettings();
    let unlocked = false;
    const timers = new Set();
    const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

    const musicForState = (state) => {
      if (!unlocked) return;
      if (state === 'START' || state === 'PLAYING') playMusic();
      else if (state === 'PAUSED') pauseMusic();
      else stopMusic(); // victory / game over have their own jingles
    };

    // Browsers block audio until the first click / key press.
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      preloadSounds();
      musicForState(useGameStore.getState().gameState);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // Any button press
    const onClick = (e) => { if (e.target instanceof Element && e.target.closest('button')) playSound('click'); };
    document.addEventListener('click', onClick, true);

    // --- store changes ---
    const unsub = useGameStore.subscribe((s, prev) => {
      if (s.gameState !== prev.gameState) {
        if (prev.gameState === 'START' && s.gameState === 'PLAYING') playSound('start');
        if (s.gameState === 'VICTORY') playSound('victory');
        if (s.gameState === 'GAME_OVER') playSound('gameOver');
        musicForState(s.gameState);
      }
      if (s.gameState !== 'PLAYING') return;
      if (s.selectedDebrisId && s.selectedDebrisId !== prev.selectedDebrisId) playSound('select');
      if (s.threatLevel >= 75 && prev.threatLevel < 75) playSound('alarm');
      if (s.timeToCollision <= 10 && s.timeToCollision < prev.timeToCollision) playSound('tick');
      if (s.bombsLeft > prev.bombsLeft) playSound('purchase');
      if (s.notices.length > prev.notices.length) {
        const n = s.notices[s.notices.length - 1];
        // "can't do that" notices; results like "TARGET SURVIVED" are not refusals
        if (n && n.type === 'warn' && !/SURVIVED|FAILED|NOT ENOUGH/.test(n.message)) playSound('denied');
        else if (n && /NOT ENOUGH/.test(n.message)) playSound('denied');
      }
    });

    // --- laser ---
    const offLaser = onLaserShot((outcome) => {
      playSound('laser');
      if (outcome === 'SUCCESS') later(120, () => playSound('nudge'));
    });

    // --- missile: launch now, explosion (or fly-by) when it arrives ---
    const offMissile = onMissileShot((shot) => {
      playSound('missileLaunch');
      const impact = shot.onImpact;
      shot.onImpact = () => {            // the scene calls shot.onImpact() on arrival
        playSound(shot.outcome === 'MISS' ? 'missileMiss' : 'explosion');
        impact();
      };
    });

    // --- bomb: throw, radiate, burst, then one explosion per destroyed debris ---
    const offBomb = onBombShot((shot) => {
      playSound('bombThrow');
      later(BOMB_FLIGHT_SECONDS * 1000, () => playSound('bombRadiate'));
      later((BOMB_FLIGHT_SECONDS + BOMB_RADIATE_SECONDS) * 1000, () => playSound('bombBurst'));
      const victim = shot.onVictim;
      shot.onVictim = (id) => { playSound('explosion'); victim(id); };
    });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('click', onClick, true);
      unsub(); offLaser(); offMissile(); offBomb();
      timers.forEach(clearTimeout);
      stopMusic();
    };
  }, []);

  return null;
}
