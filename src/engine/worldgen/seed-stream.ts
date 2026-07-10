/**
 * Derives independent deterministic random fields from a world seed and stable names.
 * Coordinate hashing prevents generation order and unrelated feature additions from changing output.
 */

/** Smooths interpolation between integer noise lattice samples. */
function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

/** Interpolates between two samples. */
function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

/** Converts an arbitrary stream name into a stable unsigned 32-bit salt. */
function hashName(name: string): number {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mixes four 32-bit values with avalanche behavior suitable for coordinate randomness. */
function mix(seed: number, x: number, y: number, z: number): number {
  let value = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** NamedSeedStream owns one compatibility-stable random field for a subsystem or feature. */
export class NamedSeedStream {
  private readonly streamSeed: number;

  public constructor(
    rootSeed: number,
    dimensionId: string,
    streamName: string,
    authoredSalt: number,
  ) {
    const dimensionSeed = mix(rootSeed | 0, hashName(dimensionId), authoredSalt | 0, 0x51ed270b);
    this.streamSeed = mix(dimensionSeed, hashName(streamName), authoredSalt | 0, 0x3c6ef372);
  }

  /** Returns a coordinate-specific value in the half-open range from zero through one. */
  public sampleUnit(x: number, y: number, z: number, attempt = 0): number {
    const attemptSeed = mix(this.streamSeed, attempt, 0x68bc21eb, 0x02e5be93);
    return mix(attemptSeed, x | 0, y | 0, z | 0) / 0x100000000;
  }

  /** Returns smoothly interpolated two-dimensional value noise in the range [-1, 1]. */
  public noise2d(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = fade(x - x0);
    const tz = fade(z - z0);
    const top = lerp(this.sampleUnit(x0, 0, z0), this.sampleUnit(x0 + 1, 0, z0), tx);
    const bottom = lerp(this.sampleUnit(x0, 0, z0 + 1), this.sampleUnit(x0 + 1, 0, z0 + 1), tx);
    return lerp(top, bottom, tz) * 2 - 1;
  }

  /** Returns smoothly interpolated three-dimensional value noise in the range [-1, 1]. */
  public noise3d(x: number, y: number, z: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const tz = fade(z - z0);
    const plane = (offsetY: number): number => {
      const top = lerp(
        this.sampleUnit(x0, y0 + offsetY, z0),
        this.sampleUnit(x0 + 1, y0 + offsetY, z0),
        tx,
      );
      const bottom = lerp(
        this.sampleUnit(x0, y0 + offsetY, z0 + 1),
        this.sampleUnit(x0 + 1, y0 + offsetY, z0 + 1),
        tx,
      );
      return lerp(top, bottom, tz);
    };
    return lerp(plane(0), plane(1), ty) * 2 - 1;
  }

  /** Combines octaves of two-dimensional noise with configurable persistence and lacunarity. */
  public fractal2d(
    x: number,
    z: number,
    octaves: number,
    persistence = 0.5,
    lacunarity = 2,
  ): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let normalization = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      total += this.noise2d(x * frequency, z * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return normalization === 0 ? 0 : total / normalization;
  }

  /** Combines octaves of three-dimensional noise for caves and volumetric terrain. */
  public fractal3d(
    x: number,
    y: number,
    z: number,
    octaves: number,
    persistence = 0.5,
    lacunarity = 2,
  ): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let normalization = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      total += this.noise3d(x * frequency, y * frequency, z * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return normalization === 0 ? 0 : total / normalization;
  }
}

/** SeedStreamFactory consistently supplies isolated streams from one saved seed and dimension. */
export class SeedStreamFactory {
  public constructor(
    private readonly rootSeed: number,
    private readonly dimensionId: string,
    private readonly authoredSalts: Readonly<Record<string, number>>,
  ) {}

  /** Creates a named field; callers should retain the result instead of sharing sequential state. */
  public stream(name: string, localSalt = 0): NamedSeedStream {
    const prefix = name.split("/", 1)[0] ?? name;
    const subsystem = prefix === "ore"
      ? "geology"
      : prefix === "decoration"
        ? "features"
        : prefix === "structure"
          ? "structures"
          : prefix;
    const authoredSalt = mix(this.authoredSalts[subsystem] ?? 0, localSalt, hashName(prefix), 0x1f83d9ab);
    return new NamedSeedStream(
      this.rootSeed,
      this.dimensionId,
      name,
      authoredSalt,
    );
  }
}
