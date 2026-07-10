/**
 * Implements deterministic two-dimensional value noise for terrain and decoration placement.
 * The generator is self-contained so a saved numeric seed fully reproduces an untouched world.
 */

/** Smooth interpolation removes visible grid corners from adjacent random lattice values. */
function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

/** Blends between two samples by the supplied normalized amount. */
function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

/** SeededNoise produces repeatable continuous samples and coordinate-specific random values. */
export class SeededNoise {
  public constructor(private readonly seed: number) {}

  /** Hashes integer coordinates and a salt into an unsigned 32-bit value. */
  private hash(x: number, z: number, salt = 0): number {
    let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(this.seed + salt, 1442695041);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return (value ^ (value >>> 16)) >>> 0;
  }

  /** Converts a coordinate hash into a stable value in the inclusive range from zero to one. */
  public sampleUnit(x: number, z: number, salt = 0): number {
    return this.hash(x, z, salt) / 0xffffffff;
  }

  /** Samples smoothly interpolated value noise in the range from negative one to positive one. */
  public value2d(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const xFraction = fade(x - x0);
    const zFraction = fade(z - z0);
    const top = lerp(this.sampleUnit(x0, z0), this.sampleUnit(x0 + 1, z0), xFraction);
    const bottom = lerp(this.sampleUnit(x0, z0 + 1), this.sampleUnit(x0 + 1, z0 + 1), xFraction);
    return lerp(top, bottom, zFraction) * 2 - 1;
  }

  /** Combines multiple noise frequencies to create broad landforms with smaller surface variation. */
  public fractal2d(x: number, z: number, octaves: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let normalization = 0;

    // Successive octaves add finer detail while diminishing amplitude prevents high-frequency dominance.
    for (let octave = 0; octave < octaves; octave += 1) {
      total += this.value2d(x * frequency, z * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return normalization === 0 ? 0 : total / normalization;
  }
}

