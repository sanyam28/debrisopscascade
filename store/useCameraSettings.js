// store/useCameraSettings.js
// Keyboard camera sensitivity: one MASTER slider plus one value per key (W A S D).
// "Linked" = the master slider is in control. Moving it sets EVERY key to that value and turns linking ON.
// Changing any single key turns linking OFF (master greyed out); toggling it back ON snaps all keys to master.
// The speed used for a key is  base speed x that key's value  (master is just the "set all" control).
// Saved in localStorage (a harmless preference - it is not part of the signed game profile).

import { create } from 'zustand';

export const SENSITIVITY_MIN = 0.1;
export const SENSITIVITY_MAX = 3;
export const SENSITIVITY_STEP = 0.05;
export const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

const STORAGE_KEY = 'debris-ops-cascade:camera-sensitivity';
const clamp = (v) => Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, Number(v) || 1));
const DEFAULTS = { master: 1, linked: true, keys: { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1 } };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return DEFAULTS;
    return {
      master: clamp(saved.master ?? 1),
      linked: saved.linked !== false,
      keys: Object.fromEntries(KEYS.map((k) => [k, clamp(saved.keys?.[k] ?? 1)])),
    };
  } catch {
    return DEFAULTS;
  }
}
function save({ master, linked, keys }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ master, linked, keys })); } catch { /* private mode etc. */ }
}

export const useCameraSettings = create((set, get) => ({
  // Start from defaults so server and client render the same HTML; hydrate() loads the saved values.
  ...DEFAULTS,
  hydrate: () => set(load()),
  setMaster: (v) => {
    const m = clamp(v);
    set({ master: m, linked: true, keys: Object.fromEntries(KEYS.map((k) => [k, m])) }); // master drags every key along
    save(get());
  },
  setKey: (code, v) => { set({ linked: false, keys: { ...get().keys, [code]: clamp(v) } }); save(get()); }, // individual tweak => master off
  setLinked: (on) => {
    if (on) set({ linked: true, keys: Object.fromEntries(KEYS.map((k) => [k, get().master])) });
    else set({ linked: false });
    save(get());
  },
  reset: () => { set({ ...DEFAULTS, keys: { ...DEFAULTS.keys } }); save(get()); },
}));
