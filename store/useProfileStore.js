// store/useProfileStore.js
// The player's profile. The browser no longer stores points / levels as plain values it could
// be edited in. It stores ONE thing: a signed JWT handed out by app/api/profile/route.js.
//
//   - Every change (level cleared, bomb bought) is a request to the server, which checks the
//     token, applies the change and returns a NEW signed token.
//   - On every page load the saved token is verified. If it was edited, deleted-and-faked or
//     otherwise doesn't match its signature, the profile is reset to level 1 (`tampered` = true).
//
// Whether replays pay is decided by REPLAY_PAYS in utils/levels.js.

import { create } from 'zustand';
import { MAX_LEVEL } from '../utils/levels';

export const TOKEN_STORAGE_KEY = 'debris-ops-cascade:token';
const LEGACY_STORAGE_KEY = 'debris-ops-cascade:profile'; // the old, editable plain-JSON save

const readToken = () => {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch { return null; }
};
const writeToken = (token) => {
  try { localStorage.setItem(TOKEN_STORAGE_KEY, token); } catch { /* private mode etc. */ }
};

async function callApi(payload) {
  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, data: await res.json() };
}

let loadPromise = null; // makes ensureProfile() safe to call twice (React StrictMode)

export const useProfileStore = create((set, get) => {
  /** Take a server response: remember the new token and show the profile it carries. */
  const adopt = (data) => {
    if (!data?.token || !data?.profile) return;
    writeToken(data.token);
    set({
      token: data.token,
      playerId: data.profile.playerId,
      points: data.profile.points,
      clearedLevels: data.profile.clearedLevels,
      ready: true,
      ...(data.reset ? { tampered: true } : {}),
    });
  };

  return {
    token: null,
    playerId: null,
    points: 0,
    clearedLevels: [],
    ready: false,      // true once the saved token has been checked by the server
    tampered: false,   // true if the saved data failed verification and was reset to level 1

    /** Call once on startup. Resolves when the profile is loaded (or reset). */
    ensureProfile: () => {
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
        const token = readToken();
        try {
          const { data } = await callApi(token ? { action: 'verify', token } : { action: 'init' });
          adopt(data);
        } catch {
          // Server unreachable: play as an unsaved guest on level 1 (nothing can be earned or spent).
          set({ token: null, playerId: 'OPS-GUEST', points: 0, clearedLevels: [], ready: true });
        }
      })();
      return loadPromise;
    },

    /** The level the player should be on: one past the highest cleared (capped at MAX_LEVEL). */
    getNextLevel: () => {
      const cleared = get().clearedLevels;
      return Math.min(MAX_LEVEL, (cleared.length ? Math.max(...cleared) : 0) + 1);
    },

    /**
     * Ask the server to pay out `level`: debrisCleared x (10 + 5 per level) points.
     * Async. Resolves { level, points, repeat, debrisCleared?, perDebris? } for the victory screen.
     */
    completeLevel: async (level, debrisCleared) => {
      const { token } = get();
      if (!token) return { level, points: 0, repeat: false, offline: true };
      try {
        const { status, data } = await callApi({ action: 'complete', token, level, debrisCleared });
        adopt(data); // new token on success; a fresh level-1 profile if the server rejected the old one
        if (status === 401 || status === 403) return { level, points: 0, repeat: false, reset: true };
        return data.award ?? { level, points: 0, repeat: false };
      } catch {
        return { level, points: 0, repeat: false, offline: true };
      }
    },

    /** Spend BOMB_COST points on an extra bomb. Resolves true if the server accepted it. */
    buyBomb: async () => {
      const { token } = get();
      if (!token) return false;
      try {
        const { status, data } = await callApi({ action: 'buyBomb', token });
        adopt(data);
        return status === 200;
      } catch {
        return false;
      }
    },

    /** Wipe the profile completely: a new level-1 profile is created. */
    resetProfile: async () => {
      try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* ignore */ }
      loadPromise = null;
      set({ token: null, playerId: null, points: 0, clearedLevels: [], ready: false });
      await get().ensureProfile();
    },
  };
});
