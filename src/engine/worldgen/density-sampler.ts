/** Builds engine-v2 height and volumetric density fields from climate and independent terrain streams. */

import type { ClimateSample, EngineBiomeDefinition, EngineWorldgenProfile } from "./generation-context";
import type { NamedSeedStream, SeedStreamFactory } from "./seed-stream";

/** DensitySampler combines continents, erosion, ridges, details, and overhang density. */
export class DensitySampler {
  private readonly ridges: NamedSeedStream;
  private readonly detail: NamedSeedStream;
  private readonly density: NamedSeedStream;

  public constructor(
    streams: SeedStreamFactory,
    private readonly profile: EngineWorldgenProfile,
    private readonly worldHeight: number,
  ) {
    this.ridges = streams.stream("terrain/ridges");
    this.detail = streams.stream("terrain/detail");
    this.density = streams.stream("terrain/density");
  }

  /** Produces the nominal terrain surface before caves, aquifers, and materials. */
  public getSurfaceHeight(
    worldX: number,
    worldZ: number,
    climate: ClimateSample,
    biome: EngineBiomeDefinition,
  ): number {
    const base = this.profile.terrain.baseHeight;
    const inland = climate.continentalness * 16;
    const erosion = climate.erosion * -7;
    const ridgeNoise = this.ridges.fractal2d(
      worldX / this.profile.terrain.ridgeScale,
      worldZ / this.profile.terrain.ridgeScale,
      4,
    );
    const ridges = (1 - Math.abs(ridgeNoise)) * 12 * (1 - Math.max(-0.4, climate.erosion));
    const detail = this.detail.fractal2d(
      worldX / this.profile.terrain.detailScale,
      worldZ / this.profile.terrain.detailScale,
      3,
    ) * 4;
    const biomeShape = biome.elevationBias + biome.elevationScale * climate.weirdness;
    const height = Math.floor(base + inland + erosion + ridges + detail + biomeShape);
    return Math.max(
      this.profile.terrain.minimumHeight,
      Math.min(this.worldHeight - this.profile.terrain.topMargin, height),
    );
  }

  /** Returns positive density for solid terrain and negative density for open terrain. */
  public sampleDensity(
    worldX: number,
    y: number,
    worldZ: number,
    surfaceHeight: number,
  ): number {
    const baseDensity = (surfaceHeight - y) * this.profile.terrain.verticalGradient;
    const scale = this.profile.terrain.densityScale;
    const overhang = this.density.fractal3d(worldX / scale, y / scale, worldZ / scale, 3);
    const verticalFade = Math.min(1, Math.max(0, (surfaceHeight - y + 10) / 10));
    return baseDensity + overhang * this.profile.terrain.overhangStrength * verticalFade;
  }
}
