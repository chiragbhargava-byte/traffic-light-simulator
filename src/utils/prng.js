/**
 * PRNG.JS - Seeded Pseudo-Random Number Generator (Mulberry32)
 * Ensures 100% deterministic, reproducible traffic arrivals across runs.
 */

export class PRNG {
  constructor(seed = 42) {
    this.seed = seed;
    this.state = seed;
  }

  /**
   * Resets the generator back to a specific seed.
   */
  setSeed(seed) {
    this.seed = seed;
    this.state = seed;
  }

  /**
   * Returns a pseudo-random floating point number in [0, 1).
   */
  next() {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a pseudo-random integer in [min, max] inclusive.
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns a pseudo-random float in [min, max).
   */
  nextFloat(min, max) {
    return min + this.next() * (max - min);
  }

  /**
   * Samples an exponential random variable with rate lambda (Poisson inter-arrival time).
   * @param {number} lambda Events per second
   * @returns {number} Inter-arrival time in seconds
   */
  sampleExponential(lambda) {
    if (lambda <= 0) return Infinity;
    const u = Math.max(1e-9, this.next());
    return -Math.log(u) / lambda;
  }
}
