// utils/sound.js
// All the game's audio in one place. Drop your .mp3 files into  public/sounds/  using the file names
// below (or change a name in SOUNDS). A sound whose file is missing is simply silent - nothing breaks.
//
// Browsers only allow audio after the player has clicked / pressed a key once; calls before that are ignored.

export const SOUNDS = {
  // name           file (in public/sounds/)   volume 0-1   loop
  music:          { file: 'music.mp3',          volume: 0.35, loop: true },  // background track (title screen + mission)
  click:          { file: 'click.mp3',          volume: 0.5 },               // any button
  denied:         { file: 'denied.mp3',         volume: 0.6 },               // "no missiles left", "behind Earth", reloading ...
  select:         { file: 'select.mp3',         volume: 0.6 },               // debris selected
  start:          { file: 'start.mp3',          volume: 0.8 },               // Start Mission
  laser:          { file: 'laser.mp3',          volume: 0.7 },               // every laser shot
  nudge:          { file: 'nudge.mp3',          volume: 0.7 },               // laser nudge succeeded
  missileLaunch:  { file: 'missile_launch.mp3', volume: 0.8 },               // missile leaves
  missileMiss:    { file: 'missile_miss.mp3',   volume: 0.7 },               // missile flies past the target
  explosion:      { file: 'explosion.mp3',      volume: 0.9 },               // missile hit / each bomb fragment hit
  bombThrow:      { file: 'bomb_throw.mp3',     volume: 0.8 },               // bowling-ball bomb thrown
  bombRadiate:    { file: 'bomb_radiate.mp3',   volume: 0.8 },               // bomb charging, radiating from its holes
  bombBurst:      { file: 'bomb_burst.mp3',     volume: 0.9 },               // bomb bursts into fragments
  purchase:       { file: 'purchase.mp3',       volume: 0.7 },               // bomb bought
  alarm:          { file: 'alarm.mp3',          volume: 0.7 },               // Risk-O-Meter climbs past 75%
  tick:           { file: 'tick.mp3',           volume: 0.6 },               // last 10 s of the Collision Window
  victory:        { file: 'victory.mp3',        volume: 0.9 },
  gameOver:       { file: 'game_over.mp3',      volume: 0.9 },
};

const BASE = '/sounds/';
const STORAGE_KEY = 'debris-ops-cascade:sound';

const bases = {};          // name -> <audio> used as the template (and as the player for looping tracks)
const missing = new Set(); // names whose file failed to load
// Music and sound effects have their own volume + mute, so one can be turned down without touching the other.
const DEFAULT_SETTINGS = { music: { volume: 0.8, muted: false }, sfx: { volume: 0.8, muted: false } };
let settings = DEFAULT_SETTINGS;
const listeners = new Set();

const canPlay = () => typeof window !== 'undefined' && typeof Audio !== 'undefined';
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0.8));
const cleanChannel = (c) => ({ volume: clamp01(c?.volume ?? 0.8), muted: !!c?.muted });

export function loadSoundSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s) settings = { music: cleanChannel(s.music), sfx: cleanChannel(s.sfx ?? s) }; // (old saves had one shared volume)
  } catch { /* ignore */ }
  applyMusicVolume();
  listeners.forEach((fn) => fn(settings));
}
function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  applyMusicVolume();
  listeners.forEach((fn) => fn(settings));
}

export const getSoundSettings = () => settings;
export const subscribeSoundSettings = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
/** channel: 'music' | 'sfx' */
export function setVolume(channel, v) { settings = { ...settings, [channel]: { ...settings[channel], volume: clamp01(v) } }; saveSettings(); }
export function setMuted(channel, m) { settings = { ...settings, [channel]: { ...settings[channel], muted: !!m } }; saveSettings(); }

function base(name) {
  if (!canPlay() || missing.has(name)) return null;
  const def = SOUNDS[name];
  if (!def) return null;
  if (!bases[name]) {
    const a = new Audio(BASE + def.file);
    a.preload = 'auto';
    a.loop = !!def.loop;
    a.addEventListener('error', () => missing.add(name)); // file not there: stay silent
    bases[name] = a;
  }
  return bases[name];
}

const channelOf = (name) => (SOUNDS[name].loop ? settings.music : settings.sfx); // looping track = music, the rest = effects
const effective = (name) => {
  const c = channelOf(name);
  return c.muted ? 0 : Math.min(1, (SOUNDS[name].volume ?? 1) * c.volume);
};

function applyMusicVolume() {
  const m = bases.music;
  if (m) m.volume = effective('music');
}

/** Start loading every file now (call once, after the first click). */
export function preloadSounds() {
  Object.keys(SOUNDS).forEach(base);
}

/** Play a one-shot sound (overlapping plays are fine). */
export function playSound(name) {
  const b = base(name);
  if (!b || SOUNDS[name].loop) return;
  const v = effective(name);
  if (v <= 0) return;
  const a = b.cloneNode(); // independent copy, so rapid shots overlap instead of cutting each other
  a.volume = v;
  a.play().catch(() => { /* not allowed yet / file missing */ });
}

/** Looping background music. */
export function playMusic() {
  const m = base('music');
  if (!m) return;
  m.volume = effective('music');
  m.play().catch(() => {});
}
export function pauseMusic() { bases.music?.pause(); }
export function stopMusic() {
  const m = bases.music;
  if (m) { m.pause(); m.currentTime = 0; }
}
