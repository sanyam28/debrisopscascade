// utils/fairRoll.js
// "Streak-breaker" random rolls (a.k.a. pseudo-random distribution).
//
// Plain Math.random() is memoryless, so 2-3 failures in a row are completely normal
// (a 57% laser fails 3x in a row about 1 shot in 22) - but it feels like a bug.
//
// Here every failed roll raises the chance of the NEXT roll, and a success resets it:
//     chance on attempt n since the last success = C * n
// C is solved so that, over many rolls, the success rate is EXACTLY the nominal
// probability. Outcomes stay random and unpredictable, but long streaks almost vanish.

/** Long-run success rate for a given C. */
function rateFor(C) {
  let expectedAttempts = 0;
  let survive = 1; // probability that every earlier attempt failed
  for (let n = 1; n <= Math.ceil(1 / C); n++) {
    const p = Math.min(1, C * n);
    expectedAttempts += n * survive * p;
    survive *= 1 - p;
  }
  return 1 / expectedAttempts;
}

/** Find C so the long-run success rate equals `p` (bisection). */
function solveC(p) {
  if (p >= 1) return 1;
  if (p <= 0) return 0;
  let lo = 0;
  let hi = p; // C can never need to exceed p
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rateFor(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Creates one independent roller per random stream (e.g. one for the missile, one for
 * the laser). Call roller.roll() -> true on success. roller.reset() on a new level.
 */
export function createFairRoller(p) {
  const C = solveC(p);
  let attempts = 0;
  return {
    roll() {
      attempts += 1;
      const success = Math.random() < Math.min(1, C * attempts);
      if (success) attempts = 0;
      return success;
    },
    reset() {
      attempts = 0;
    },
  };
}
