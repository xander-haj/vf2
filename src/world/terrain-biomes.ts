/**
 * Classifies deterministic Overworld-style biomes and resolves their visible surface strata.
 * WorldGenerator delegates material choice here while retaining ownership of terrain height and trees.
 */

import { BlockId } from "../game/block-types";
import { BASE_TERRAIN_HEIGHT } from "../game/game-config";
import type { SeededNoise } from "./noise";

/** TerrainBiome names every material profile that can shape an otherwise unchanged terrain column. */
export enum TerrainBiome {
  Plains,
  Desert,
  Badlands,
  Snowy,
  Gravelly,
  Mushroom,
  Taiga,
  Marsh,
  Lush,
  Mountains,
}

// Repeating bands recreate the layered mineral colors exposed on badlands cliffs.
const TERRACOTTA_BANDS: readonly BlockId[] = [
  BlockId.Terracotta,
  BlockId.OrangeTerracotta,
  BlockId.YellowTerracotta,
  BlockId.Terracotta,
  BlockId.WhiteTerracotta,
  BlockId.LightGrayTerracotta,
  BlockId.RedTerracotta,
  BlockId.BrownTerracotta,
];

/** TerrainBiomeSampler derives broad climate regions from continuous noise rather than chunk boundaries. */
export class TerrainBiomeSampler {
  public constructor(private readonly noise: SeededNoise) {}

  /** Selects a stable biome from climate, moisture, variation, and the already-computed surface height. */
  public getBiome(worldX: number, worldZ: number, surface: number): TerrainBiome {
    const temperature = this.noise.fractal2d(worldX / 105, worldZ / 105, 3);
    const moisture = this.noise.fractal2d((worldX + 600) / 92, (worldZ - 400) / 92, 3);
    const variation = this.noise.fractal2d((worldX - 900) / 58, (worldZ + 700) / 58, 2);

    // Elevation takes priority because exposed peaks should remain visibly mountainous in every climate region.
    if (surface >= BASE_TERRAIN_HEIGHT + 10) {
      return TerrainBiome.Mountains;
    }
    // Small isolated regions provide rare mycelium terrain without making it a dominant surface material.
    if (variation > 0.72 && moisture > 0.12) {
      return TerrainBiome.Mushroom;
    }
    if (temperature > 0.38 && moisture < -0.18) {
      return variation > 0.08 ? TerrainBiome.Badlands : TerrainBiome.Desert;
    }
    if (temperature < -0.34) {
      return TerrainBiome.Snowy;
    }
    if (moisture > 0.42) {
      return temperature > 0.05 ? TerrainBiome.Marsh : TerrainBiome.Lush;
    }
    if (variation < -0.46) {
      return TerrainBiome.Gravelly;
    }
    if (temperature < -0.08 && moisture > -0.12) {
      return TerrainBiome.Taiga;
    }
    return TerrainBiome.Plains;
  }

  /** Returns a biome-controlled surface block, or null when underground geology should take over. */
  public getSurfaceLayer(
    biome: TerrainBiome,
    depth: number,
    worldX: number,
    worldZ: number,
    surface: number,
  ): BlockId | null {
    // Surface profiles are intentionally shallow so deeper rock and ore systems remain shared across biomes.
    switch (biome) {
      case TerrainBiome.Desert:
        if (depth <= 3) return BlockId.Sand;
        return depth <= 6 ? BlockId.Sandstone : null;
      case TerrainBiome.Badlands:
        if (depth === 0) return BlockId.RedSand;
        if (depth <= 2) return BlockId.RedSandstone;
        return depth <= 14 ? TERRACOTTA_BANDS[(surface - depth) % TERRACOTTA_BANDS.length] ?? null : null;
      case TerrainBiome.Snowy:
        if (depth === 0) return this.getFrozenSurface(worldX, worldZ);
        return depth <= 3 ? BlockId.Dirt : null;
      case TerrainBiome.Gravelly:
        return depth <= 2 ? BlockId.Gravel : null;
      case TerrainBiome.Mushroom:
        if (depth === 0) return BlockId.Mycelium;
        return depth <= 3 ? BlockId.Dirt : null;
      case TerrainBiome.Taiga:
        if (depth === 0) return BlockId.Podzol;
        if (depth === 1) return BlockId.CoarseDirt;
        return depth <= 3 ? BlockId.Dirt : null;
      case TerrainBiome.Marsh:
        if (depth <= 1) return BlockId.Mud;
        return depth <= 4 ? BlockId.Clay : null;
      case TerrainBiome.Lush:
        if (depth === 0) return BlockId.Moss;
        if (depth <= 2) return BlockId.Dirt;
        return depth <= 4 ? BlockId.Clay : null;
      case TerrainBiome.Mountains:
        if (depth === 0) return surface >= BASE_TERRAIN_HEIGHT + 14 ? BlockId.Snow : BlockId.Stone;
        return depth <= 2 ? BlockId.Gravel : null;
      case TerrainBiome.Plains:
        if (depth === 0) return BlockId.Grass;
        return depth <= 3 ? BlockId.Dirt : null;
    }
  }

  /** Mixes snow and three solid ice variants into cold surfaces without introducing water simulation. */
  private getFrozenSurface(worldX: number, worldZ: number): BlockId {
    const frozenSample = this.noise.sampleUnit(worldX, worldZ, 1201);
    if (frozenSample > 0.985) return BlockId.BlueIce;
    if (frozenSample > 0.94) return BlockId.PackedIce;
    if (frozenSample > 0.84) return BlockId.Ice;
    return BlockId.Snow;
  }
}
