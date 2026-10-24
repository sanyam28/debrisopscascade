// utils/piSeeder.js
// Deterministic "randomness" from the digits of pi.
//
// Pi is computed ONCE at first use with BigInt (Machin's formula), so there is no
// giant digit string to maintain. Every level reads its own 1000-digit window, which means
// level N always spawns exactly the same debris field (that is what makes it possible to
// verify offline that a level is winnable - see scripts/verify-levels.mjs).

export const DIGITS_PER_LEVEL = 1000;
const TOTAL_LEVELS = 15;
const TOTAL_DIGITS = DIGITS_PER_LEVEL * TOTAL_LEVELS + 50;

let cache = null;

/** arctan(1/x) scaled by `unity` (big-integer fixed point). */
function arctanInv(x, unity) {
  const X = BigInt(x);
  const x2 = X * X;
  let term = unity / X;
  let sum = term;
  let n = 1n;
  let sign = 1n;
  while (term !== 0n) {
    term /= x2;
    n += 2n;
    sign = -sign;
    sum += sign * (term / n);
  }
  return sum;
}

/** All digits of pi as one string: "31415926535..." (the leading 3 is index 0). */
export function getPiDigits() {
  if (cache) return cache;
  const guard = 12n;
  const unity = 10n ** (BigInt(TOTAL_DIGITS) + guard);
  const pi = 4n * (4n * arctanInv(5, unity) - arctanInv(239, unity));
  cache = pi.toString().slice(0, TOTAL_DIGITS);
  return cache;
}

/**
 * A reader over one level's window of pi. `salt` shifts the window, so if a level ever
 * needs a re-roll it is still deterministic (salt 0, 1, 2, ...).
 */
export function createPiReader(level, salt = 0) {
  const digits = getPiDigits();
  let pos = ((level - 1) * DIGITS_PER_LEVEL + salt * 97) % digits.length;

  const digit = () => {
    const d = digits.charCodeAt(pos) - 48;
    pos = (pos + 1) % digits.length;
    return d;
  };

  return {
    digit,
    /** number in [0, 1) built from k digits */
    float(k = 3) {
      let v = 0;
      let scale = 1;
      for (let i = 0; i < k; i++) {
        v = v * 10 + digit();
        scale *= 10;
      }
      return v / scale;
    },
    /** number in [min, max) */
    range(min, max, k = 3) {
      return min + this.float(k) * (max - min);
    },
  };
}
