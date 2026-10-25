'use client';

import { useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';

// Global hotkeys (renders nothing):
//   Space  -> fire a missile at the debris you are aiming at (hovering), else the selected one
//   B      -> bomb (level 7+)
//   Esc / P -> pause / resume
//   (W A S D steer the camera: see components/canvas/CameraKeyControls.jsx)
//   Enter  -> start the game from the title screen
export default function KeyboardControls() {
  useEffect(() => {
    const isTyping = (el) =>
      !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    const onKeyDown = (e) => {
      if (isTyping(e.target)) return;
      const s = useGameStore.getState();

      if (e.code === 'Space') {
        if (s.gameState !== 'PLAYING') return;
        // Stop the page scrolling AND stop Space "clicking" whichever button was clicked last.
        e.preventDefault();
        if (e.repeat) return; // holding the key must not machine-gun missiles

        const target = s.hoveredDebrisId ?? s.selectedDebrisId;
        if (!target) {
          s.pushNotice('AIM AT A DEBRIS FIRST', 'info');
          return;
        }
        if (target !== s.selectedDebrisId) s.selectDebris(target);
        s.fireMissile();
        return;
      }

      if (e.code === 'KeyB') {
        if (s.gameState === 'PLAYING' && !e.repeat) {
          // Like Space: bomb the debris under the pointer (or the selected one)
          if (s.hoveredDebrisId && s.hoveredDebrisId !== s.selectedDebrisId) s.selectDebris(s.hoveredDebrisId);
          s.fireBomb(); // does nothing below level 7
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (s.gameState === 'PLAYING') s.pauseGame();
        else if (s.gameState === 'PAUSED') s.resumeGame();
        return;
      }

      if (e.code === 'Enter' && s.gameState === 'START') s.startGame();
    };

    // Some browsers activate a focused button on Space *key-up*, so block that too.
    const onKeyUp = (e) => {
      if (e.code === 'Space' && !isTyping(e.target) && useGameStore.getState().gameState === 'PLAYING') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return null;
}
