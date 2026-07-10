/** Resolves bedrock, base geology, shores, biome tops, and fillers for engine-v2 solid terrain. */

import { BlockId } from "../../game/block-types";
import type { EngineBiomeDefinition, EngineWorldgenProfile } from "./generation-context";
import type { NamedSeedStream, SeedStreamFactory } from "./seed-stream";

/** SurfaceResolver maps density-derived solids to their ordered material layer. */
export class SurfaceResolver {
  private readonly bedrock: NamedSeedStream;
  private readonly strata: NamedSeedStream;

  public constructor(
    streams: SeedStreamFactory,
    private readonly profile: EngineWorldgenProfile,
  ) {
    this.bedrock = streams.stream("surface/bedrock");
    this.strata = streams.stream("surface/strata");
  }

  /** Resolves a solid block before ore replacement and post-terrain features. */
  public resolveSolid(
    worldX: number,
    y: number,
    worldZ: number,
    surfaceHeight: number,
    biome: EngineBiomeDefinition,
    exposedAbove: boolean,
  ): BlockId {
    const bedrockMaximum = this.profile.bedrock.maximumHeight;
    const threshold = bedrockMaximum === 0 ? 1 : y / (bedrockMaximum + 1);
    if (y === 0 || (y <= bedrockMaximum && this.bedrock.sampleUnit(worldX, y, worldZ) > threshold)) {
      return this.profile.bedrock.block;
    }
    const depth = Math.max(0, surfaceHeight - y);
    if (exposedAbove && y <= this.profile.seaLevel + 1) {
      return y < this.profile.seaLevel ? biome.underwaterBlock : biome.shoreBlock;
    }
    if (exposedAbove) {
      return biome.topBlock;
    }
    if (depth <= biome.fillerDepth) {
      return biome.fillerBlock;
    }
    const stratum = this.strata.noise3d(worldX / 22, y / 9, worldZ / 22);
    if (y <= Math.max(12, this.profile.lavaLevel + 7)) {
      return stratum > 0.78 ? BlockId.Tuff : BlockId.Deepslate;
    }
    if (stratum > 0.82) return BlockId.Granite;
    if (stratum < -0.84) return BlockId.Diorite;
    if (Math.abs(stratum) < 0.035) return BlockId.Andesite;
    return BlockId.Stone;
  }
}
