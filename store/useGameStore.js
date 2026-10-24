// store/useGameStore.js
import { create } from 'zustand';
import { assessDebrisField } from '../utils/risk';
import { computeNudge } from '../utils/nudge';
import { getAimDirection, isDirection, isAimBlocked, emitLaserShot } from '../utils/aim';
import { createFairRoller } from '../utils/fairRoll';
import { generateLevel } from '../utils/levelGenerator';
import { getLevelConfig, riskConfigFor, clampLevel, SIM_SPEED, MAX_LEVEL, BOMB_UNLOCK_LEVEL, BOMB_COST, BOMB_TARGETS, NUDGE_COUNTS_AS_CLEARED } from '../utils/levels';
import { useProfileStore } from './useProfileStore';

// If the player fires nothing for this many seconds, debris collides => game over.
// This is the "Collision Window" countdown shown in the control panel.
export const ACTION_TIMEOUT_SECONDS = 30;

// Reload time after EVERY missile shot (hit or miss). Same on every level.
export const MISSILE_COOLDOWN_SECONDS = 5;

// Laser reload when 'Spam Laser Mode' is OFF. With the toggle ON there is no cooldown.
export const LASER_COOLDOWN_SECONDS = 1;

// Everything that changes per level (hit chances, missile count, speed, pressure, ...)
// now lives in utils/levels.js -> getLevelConfig(level), and is kept in state as `levelConfig`.

// Streak-breaking random rolls (see utils/fairRoll.js). One roller per weapon, rolling the
// OVERALL success chance (hit x effect). They depend on the level's chances, so they are
// rebuilt every time a level is (re)initialised.
let missileRoller = createFairRoller(1);
let laserRoller = createFairRoller(1);
function makeRollers(cfg) {
  missileRoller = createFairRoller(cfg.missileHitChance * cfg.missileDestroyChance);
  laserRoller = createFairRoller(cfg.laserHitChance * cfg.laserNudgeChance);
}

/** One weapon shot -> 'SUCCESS' | 'HIT_FAILED' (hit, but no effect) | 'MISS'. */
function rollShot(roller, hitChance, effectChance) {
  if (roller.roll()) return 'SUCCESS';
  // A failure is either a miss or a hit-without-effect, in proportion to their real odds.
  const pMissGivenFail = (1 - hitChance) / (1 - hitChance * effectChance);
  return Math.random() < pMissGivenFail ? 'MISS' : 'HIT_FAILED';
}

/** Adds debris ids to the run's cleared list (each id counts once) and returns the state patch. */
function withCleared(state, ids) {
  const all = new Set(state.clearedIds);
  ids.forEach((id) => all.add(id));
  return { clearedIds: [...all], debrisCleared: all.size };
}

// Id counter for on-screen notices (see pushNotice below)
let noticeCounter = 0;

const FIRST_CONFIG = getLevelConfig(1);

export const useGameStore = create((set, get) => ({
  // Level
  level: 1,                       // 1..MAX_LEVEL
  levelConfig: FIRST_CONFIG,      // difficulty numbers for this level (utils/levels.js)
  riskConfig: riskConfigFor(FIRST_CONFIG),
  runId: 0,                       // +1 every time a level starts/restarts (lets the UI react once per run)

  // Game Loop Metrics
  threatLevel: 65,            // Starts elevated (target: <= 25% to win, >= 100% lose)
  missileLaunchesLeft: FIRST_CONFIG.missiles,
  missileCooldown: 0,         // seconds until the next missile can be fired (0 = ready)
  laserCooldown: 0,           // seconds until the next laser shot (only used while spamLaser is OFF)
  spamLaser: false,           // 'Spam Laser Mode' toggle (bottom-right). ON = no laser cooldown
  bombsLeft: FIRST_CONFIG.bombs, // free bombs left this level (0 below level 7)
  bombPending: false,         // true while an extra bomb is being bought (blocks double clicks)
  debrisCleared: 0,           // debris CLEARED this run (destroyed, or nudged away by the laser) -> paid out on victory
  clearedIds: [],             // which debris those were (each counts once)
  notices: [],                // on-screen popup messages (replaces alert())
  timeToCollision: ACTION_TIMEOUT_SECONDS, // Collision Window: seconds left to act (resets only when a weapon SUCCEEDS on a RED / high-risk debris: missile kill, laser nudge, bomb)
  gameState: 'START',         // 'START' (title screen) | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER'
  gameOverReason: null,       // null | 'COLLISION' (player idle) | 'CASCADE' (risk hit 100%)

  // Selection State
  selectedDebrisId: null,
  hoveredDebrisId: null,      // debris currently under the mouse pointer (the one being "aimed at")

  // Dynamic Debris State
  debrisList: [],

  // Shared simulation clock (seconds). The renderer AND the risk maths both read
  // this, so the distance used for risk is the distance you see on screen.
  simTime: 0,
  // 0-100: pushes every debris' risk toward 100% over time (see assessDebrisField).
  riskPressure: 0,

  // Build a level: pi-seeded debris (utils/levelGenerator.js) + that level's difficulty numbers.
  // startState: 'PLAYING' (default) or 'START' (title screen: scenery moves, clock frozen)
  initLevel: (level = get().level, startState = 'PLAYING') => {
    const lvl = clampLevel(level);
    const { debris, cfg } = generateLevel(lvl);
    makeRollers(cfg);

    set({
      level: lvl,
      levelConfig: cfg,
      riskConfig: riskConfigFor(cfg),
      runId: get().runId + 1,
      debrisList: debris,
      gameState: startState,
      gameOverReason: null,
      hoveredDebrisId: null,
      timeToCollision: ACTION_TIMEOUT_SECONDS,
      missileLaunchesLeft: cfg.missiles,
      missileCooldown: 0,
      laserCooldown: 0,
      bombsLeft: cfg.bombs,
      bombPending: false,
      debrisCleared: 0,
      clearedIds: [],
      notices: [],
      simTime: 0,
      riskPressure: 0,
      selectedDebrisId: null,
    });
    get().recalculateThreat();
  },

  selectDebris: (id) => set({ selectedDebrisId: id }),
  setSpamLaser: (on) => set({ spamLaser: !!on }),
  setHoveredDebris: (id) => set({ hoveredDebrisId: id }),

  // ---- Game flow: start screen / pause menu / level progression ------------------
  // START -> PLAYING. Keeps the debris you see on the title screen, but rewinds the clock
  // to t=0 so every run begins from the same layout, and resets all timers and weapons.
  startGame: () => {
    if (get().gameState !== 'START') return; // ignore double clicks / Enter + click
    makeRollers(get().levelConfig);
    set({
      runId: get().runId + 1,
      gameState: 'PLAYING',
      gameOverReason: null,
      simTime: 0,
      riskPressure: 0,
      timeToCollision: ACTION_TIMEOUT_SECONDS,
      missileLaunchesLeft: get().levelConfig.missiles,
      missileCooldown: 0,
      laserCooldown: 0,
      bombsLeft: get().levelConfig.bombs,
      bombPending: false,
      debrisCleared: 0,
      clearedIds: [],
      notices: [],
      selectedDebrisId: null,
      hoveredDebrisId: null,
    });
    get().recalculateThreat();
  },
  pauseGame: () => {
    if (get().gameState === 'PLAYING') set({ gameState: 'PAUSED' });
  },
  resumeGame: () => {
    if (get().gameState === 'PAUSED') set({ gameState: 'PLAYING' });
  },
  restartLevel: () => get().initLevel(get().level, 'PLAYING'),   // same level, same layout, straight back into play
  exitToMenu: () => get().initLevel(get().level, 'START'),       // back to the title screen
  // After a victory: the NEXT level's briefing screen (press Start Mission to play it).
  nextLevel: () => get().initLevel(Math.min(MAX_LEVEL, get().level + 1), 'START'),
  // Title-screen level picker (the UI only offers levels the player has unlocked).
  selectLevel: (level) => {
    if (get().gameState === 'START') get().initLevel(level, 'START');
  },

  // On-screen popup (replaces alert()). type: 'success' | 'miss' | 'warn' | 'info'
  pushNotice: (message, type = 'info', duration = 2600) => {
    const id = ++noticeCounter;
    // keep at most 4 on screen; oldest drops off first
    set((state) => ({ notices: [...state.notices.slice(-3), { id, message, type, duration }] }));
    setTimeout(() => get().dismissNotice(id), duration);
  },
  dismissNotice: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),

  // Recompute every debris' risk from its CURRENT distance to the ISS
  // (risk ∝ 1/distance), flag the top 5, and update the Risk-O-Meter.
  recalculateThreat: () => {
    const { debrisList, simTime, riskPressure, riskConfig, threatLevel: prevThreat, gameState: prevState } = get();
    // Runs while playing, and on the title screen (so the HUD shows live numbers there).
    // Never when paused or once the game is decided (victory / game over).
    if (prevState !== 'PLAYING' && prevState !== 'START') return;
    const playing = prevState === 'PLAYING';
    if (debrisList.length === 0) {
      if (playing) set({ threatLevel: 0, gameState: 'VICTORY' });
      return;
    }

    const { debris, threatLevel } = assessDebrisField(debrisList, simTime, { pressure: riskPressure, config: riskConfig });

    let nextState = prevState; // on the title screen the state never changes
    if (playing) {
      if (threatLevel <= 25) nextState = 'VICTORY';
      if (threatLevel >= 100) nextState = 'GAME_OVER';
    }

    // Skip the update (and the React re-render) when nothing visible changed.
    const changed =
      threatLevel !== prevThreat ||
      nextState !== prevState ||
      debris.some((d, i) => d.riskPercentage !== debrisList[i].riskPercentage || d.isHighRisk !== debrisList[i].isHighRisk);
    if (!changed) return;

    set({ debrisList: debris, threatLevel, gameState: nextState, gameOverReason: nextState === 'GAME_OVER' ? 'CASCADE' : null });
  },

  // Called every frame by <SimulationDriver/>: advances the clock, and
  // refreshes risks ~4 times a second (cheap, avoids re-rendering at 60 fps).
  advanceSimulation: (delta) => {
    const { gameState, simTime, missileCooldown, laserCooldown } = get();
    // Moves while playing AND on the title screen (scenery only). PAUSED / VICTORY /
    // GAME_OVER freeze the clock completely.
    if (gameState !== 'PLAYING' && gameState !== 'START') return;
    const next = simTime + delta * SIM_SPEED;
    // The missile / laser reloads run on real frame time (not sim time), so they are true seconds.
    const patch = { simTime: next };
    if (missileCooldown > 0) patch.missileCooldown = Math.max(0, missileCooldown - delta);
    if (laserCooldown > 0) patch.laserCooldown = Math.max(0, laserCooldown - delta);
    set(patch);
    if (Math.floor(next * 4) !== Math.floor(simTime * 4)) get().recalculateThreat();
  },

  // Fire Action 1: Missile Launch
  fireMissile: () => {
    const { gameState, selectedDebrisId, missileLaunchesLeft, missileCooldown, debrisList, levelConfig, pushNotice, recalculateThreat } = get();
    if (gameState !== 'PLAYING' || !selectedDebrisId) return;
    if (missileLaunchesLeft <= 0) {
      pushNotice('NO MISSILES LEFT', 'warn');
      return;
    }
    if (missileCooldown > 0) {
      pushNotice(`MISSILE RELOADING - ${Math.ceil(missileCooldown)}s`, 'warn');
      return;
    }
    // Every shot (hit or miss) starts the reload. The Collision Window only resets on a
    // successful kill of a RED debris (below) - misses, survivors and non-red kills buy no time.
    set({ missileCooldown: MISSILE_COOLDOWN_SECONDS });

    const outcome = rollShot(missileRoller, levelConfig.missileHitChance, levelConfig.missileDestroyChance);

    if (outcome === 'SUCCESS') {
      // Hit AND destroyed. The Collision Window resets only if the target was a RED (high-risk) debris.
      const wasRed = !!debrisList.find((d) => d.id === selectedDebrisId)?.isHighRisk;
      set({
        ...(wasRed ? { timeToCollision: ACTION_TIMEOUT_SECONDS } : {}),
        debrisList: debrisList.filter((d) => d.id !== selectedDebrisId),
        missileLaunchesLeft: missileLaunchesLeft - 1,
        selectedDebrisId: null,
        ...withCleared(get(), [selectedDebrisId]),
      });
      pushNotice(`MISSILE HIT - ${selectedDebrisId} DESTROYED${wasRed ? '' : ' (NOT A RED TARGET - TIMER NOT RESET)'}`, 'success');
    } else if (outcome === 'HIT_FAILED') {
      // Hit, but the debris survived: launch is spent, target stays selected.
      set({ missileLaunchesLeft: missileLaunchesLeft - 1 });
      pushNotice('MISSILE HIT - TARGET SURVIVED', 'warn');
    } else {
      set({ missileLaunchesLeft: missileLaunchesLeft - 1 });
      pushNotice('MISSILE MISSED TARGET', 'miss');
    }

    recalculateThreat();
  },

  // Fire Action 2: Laser Nudge
  // aimDir (optional): world-space direction of the laser ray. Omitted => last camera->debris aim.
  fireLaser: (aimDir) => {
    const { gameState, selectedDebrisId, debrisList, levelConfig, spamLaser, laserCooldown, pushNotice, recalculateThreat } = get();
    if (gameState !== 'PLAYING' || !selectedDebrisId) return;
    // Rule: the Earth blocks the laser. Refuse before spending cooldown / resetting the Collision Window.
    if (isAimBlocked()) {
      pushNotice('TARGET BEHIND EARTH - NO LINE OF SIGHT', 'warn');
      return;
    }
    // Spam Laser Mode OFF => 1 second reload between shots. ON => no limit.
    if (!spamLaser && laserCooldown > 0) {
      pushNotice('LASER RECHARGING', 'warn', 900);
      return;
    }
    // Every shot starts the reload, but the Collision Window is NOT reset here:
    // only a successful nudge of a RED (high-risk) debris resets it (see below).
    set({ laserCooldown: spamLaser ? 0 : LASER_COOLDOWN_SECONDS });
    emitLaserShot(); // HUD flashes the beam from the laser origin (components/ui/LaserOrigin.jsx)

    const outcome = rollShot(laserRoller, levelConfig.laserHitChance, levelConfig.laserNudgeChance);

    if (outcome === 'SUCCESS') {
      const target = debrisList.find((d) => d.id === selectedDebrisId);
      // Push the debris along the laser direction into the safest reachable orbit
      // (see utils/nudge.js). Returns { radius, initialAngle } or null.
      const dir = isDirection(aimDir) ? aimDir : getAimDirection();
      const nudge = target ? computeNudge(target, get().simTime, dir) : null;
      if (nudge) {
        // The Collision Window resets only if the nudged debris was RED (high-risk) when shot.
        const wasRed = !!target?.isHighRisk;
        set({
          ...(wasRed ? { timeToCollision: ACTION_TIMEOUT_SECONDS } : {}),
          debrisList: debrisList.map((d) =>
            d.id === selectedDebrisId ? { ...d, ...nudge, nudges: (d.nudges || 0) + 1 } : d
          ),
          // A successful nudge clears that debris (once) - see NUDGE_COUNTS_AS_CLEARED in utils/levels.js
          ...(NUDGE_COUNTS_AS_CLEARED ? withCleared(get(), [selectedDebrisId]) : {}),
        });
        pushNotice(`ORBIT NUDGED - ${selectedDebrisId} PUSHED CLEAR${wasRed ? '' : ' (NOT A RED TARGET - TIMER NOT RESET)'}`, 'success');
      } else {
        pushNotice(dir ? 'NO SAFER ZONE IN LASER DIRECTION' : 'NO SAFER ORBIT AVAILABLE FOR THIS TARGET', 'info');
      }
    } else if (outcome === 'HIT_FAILED') {
      pushNotice('LASER HIT - ORBIT NUDGE FAILED', 'warn');
    } else {
      pushNotice('LASER MISSED TARGET', 'miss');
    }

    recalculateThreat();
  },

  // Buy a bomb (level 7+): costs BOMB_COST points, added to this level's bomb stock.
  // The points are spent on the server (store/useProfileStore.js) so they can't be faked.
  buyBomb: async () => {
    const s = get();
    if (s.gameState !== 'PLAYING' || s.bombPending || s.level < BOMB_UNLOCK_LEVEL) return;
    set({ bombPending: true }); // blocks double clicks while the server answers
    const bought = await useProfileStore.getState().buyBomb();
    set({ bombPending: false });
    if (!bought) {
      get().pushNotice(`NOT ENOUGH POINTS - A BOMB COSTS ${BOMB_COST}`, 'warn');
      return;
    }
    set({ bombsLeft: get().bombsLeft + 1 });
    get().pushNotice(`BOMB BOUGHT (-${BOMB_COST} PTS)`, 'info');
  },

  // Fire Action 3 (level 7+): Bomb. Destroys the BOMB_TARGETS debris closest to a satellite,
  // no aiming and no roll. Each level starts with 1 free bomb; after that you must buy more.
  fireBomb: () => {
    const s = get();
    if (s.gameState !== 'PLAYING' || s.level < BOMB_UNLOCK_LEVEL) return;
    if (s.bombsLeft <= 0) {
      s.pushNotice(`NO BOMBS LEFT - BUY ONE FOR ${BOMB_COST} PTS`, 'warn');
      return;
    }

    const { debrisList, selectedDebrisId, pushNotice, recalculateThreat } = s;
    const victims = [...debrisList]
      .sort((a, b) => a.distanceToTarget - b.distanceToTarget) // closest to the satellite first
      .slice(0, BOMB_TARGETS);
    const gone = new Set(victims.map((d) => d.id));

    // The Collision Window resets only if the bomb took out at least one RED (high-risk) debris.
    const hitRed = victims.some((d) => d.isHighRisk);
    set({
      bombsLeft: s.bombsLeft - 1,
      debrisList: debrisList.filter((d) => !gone.has(d.id)),
      ...withCleared(s, [...gone]),
      selectedDebrisId: gone.has(selectedDebrisId) ? null : selectedDebrisId,
      ...(hitRed ? { timeToCollision: ACTION_TIMEOUT_SECONDS } : {}),
    });
    pushNotice(`BOMB DETONATED - ${victims.length} DEBRIS ERADICATED${hitRed ? '' : ' (NO RED TARGETS - TIMER NOT RESET)'}`, 'success');
    recalculateThreat();
  },

  // Passive threat accumulation: risk drifts upward over time on top of the
  // distance-based risk. Also runs the Collision Window countdown.
  tickTimer: () => {
    const { gameState, timeToCollision, levelConfig, recalculateThreat } = get();
    if (gameState !== 'PLAYING') return;

    // Collision Window ran out without the player acting => debris collision.
    if (timeToCollision <= 1) {
      set({ timeToCollision: 0, gameState: 'GAME_OVER', gameOverReason: 'COLLISION' });
      return;
    }

    set((state) => ({
      riskPressure: state.riskPressure + levelConfig.pressurePerSecond,
      timeToCollision: state.timeToCollision - 1,
    }));
    recalculateThreat();
  },
}));
