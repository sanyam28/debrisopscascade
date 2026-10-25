// utils/sound.js
// All the game's audio in one place. Drop your .mp3 files into  public/sounds/  using the file names
// below (or change a name in SOUNDS). A sound whose file is missing is simply silent - nothing breaks.
//
// Browsers only allow audio after the player has clicked / pressed a key once; calls before that are ignored.

export const SOUNDS = {
  // name           file (in public/sounds/)   volume 0-1   loop
  music:          { file: 'music.mp3',          volume: 1.0,  loop: true },  // background track (title screen + mission)
  click:          { file: 'click.mp3',          volume: 0.5 },               // any button
  denied:         { file: 'denied.mp3',         volume: 0.3 },               // "no missiles left", "behind Earth", reloading ...
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

// A plain <audio> tag cannot go louder than 100%. MUSIC_BOOST routes the music through the Web Audio API
// so it can be amplified past that (1 = no boost, 2 = twice as loud). A compressor keeps it from distorting.
// The Music slider still goes from silent to this full boosted level. Set to 1 to turn the boost off.
const MUSIC_BOOST = 2.2;
const STORAGE_KEY = 'debris-ops-cascade:sound';

// Kept on globalThis so a hot-reload of this file (next dev) re-uses the SAME <audio> elements instead of
// leaving an old, uncontrollable music track playing next to a new one.
const G = typeof globalThis !== 'undefined' ? globalThis : {};
const bases = (G.__debrisOpsAudio ||= {}); // name -> <audio> used as the template (and as the player for looping tracks)
let musicWanted = false;                   // the game wants music playing right now (title screen / mission)
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
  if (!m) return;
  const v = effective('music');
  m.volume = v;
  m.muted = v === 0;                                   // belt and braces: volume 0 must really be silent
  if (v === 0) m.pause();                              // nothing to hear, so don't even run the track
  else if (musicWanted && m.paused) m.play().catch(() => {}); // slider raised again: carry on
}

function boostMusic(m) {
  if (MUSIC_BOOST <= 1 || G.__debrisOpsBoost || typeof window.AudioContext === 'undefined') return;
  try {
    const ctx = new window.AudioContext();
    const src = ctx.createMediaElementSource(m); // can only ever be done once per element
    const gain = ctx.createGain();
    gain.gain.value = MUSIC_BOOST;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    src.connect(gain).connect(limiter).connect(ctx.destination);
    G.__debrisOpsBoost = ctx;
  } catch { /* no Web Audio: music just plays at normal (non-boosted) level */ }
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
  musicWanted = true;
  const m = base('music');
  if (!m) return;
  boostMusic(m);
  G.__debrisOpsBoost?.resume?.().catch?.(() => {});
  applyMusicVolume(); // sets the volume and starts the track (unless volume is 0)
}
export function pauseMusic() { musicWanted = false; bases.music?.pause(); }
export function stopMusic() {
  musicWanted = false;
  const m = bases.music;
  if (m) { m.pause(); m.currentTime = 0; }
}
