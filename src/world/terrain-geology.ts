/**
 * Resolves bedrock, stone families, mineral clusters, and depth-aware ores below biome surface layers.
 * Coordinate-only sampling keeps geology deterministic and continuous across streamed chunk boundaries.
 */

import { BlockId } from "../game/block-types";
import type { SeededNoise } from "./noise";
import { TerrainBiome } from "./terrain-biomes";
import type { TerrainProfile } from "./world-profile";

/** Maps a normal stone ore to the equivalent deepslate texture while preserving the mineral type. */
function toDepthVariant(
  normal: BlockId,
  deepslate: BlockId,
  y: number,
  deepslateMaximumHeight: number,
): BlockId {
  return y <= deepslateMaximumHeight ? deepslate : normal;
}

/** TerrainGeology chooses one complete underground block for an absolute world coordinate. */
export class TerrainGeology {
  public constructor(
    private readonly noise: SeededNoise,
    private readonly terrain: TerrainProfile,
  ) {}

  /** Returns bedrock, an ore, a decorative rock family, or the depth-appropriate base stone. */
  public getBlock(worldX: number, y: number, worldZ: number, biome: TerrainBiome): BlockId {
    if (this.isBedrock(worldX, y, worldZ)) {
      return BlockId.Bedrock;
    }
    const ore = this.getOre(worldX, y, worldZ, biome);
    if (ore !== null) {
      return ore;
    }
    const rock = this.getRockVariant(worldX, y, worldZ);
    return rock ?? (y <= this.terrain.deepslateMaximumHeight ? BlockId.Deepslate : BlockId.Stone);
  }

  /** Creates a visually dense bottom layer with a noisy upper edge instead of a perfectly flat seam. */
  private isBedrock(worldX: number, y: number, worldZ: number): boolean {
    if (y === 0) {
      return true;
    }
    if (y > this.terrain.bedrockMaximumHeight) {
      return false;
    }
    const requiredSample = y === 1 ? 0.28 : 0.76;
    return this.noise.sampleUnit(worldX, worldZ, 1301 + y) > requiredSample;
  }

  /** Applies rare ores before decorative stone so valuable veins remain visible throughout eligible depths. */
  private getOre(worldX: number, y: number, worldZ: number, biome: TerrainBiome): BlockId | null {
    if (y <= 12 && this.isVein(worldX, y, worldZ, 1409, 0.965)) {
      return this.toDepthVariant(BlockId.DiamondOre, BlockId.DeepslateDiamondOre, y);
    }
    if (y <= 16 && this.isVein(worldX, y, worldZ, 1423, 0.935)) {
      return this.toDepthVariant(BlockId.RedstoneOre, BlockId.DeepslateRedstoneOre, y);
    }
    if (y >= 4 && y <= 24 && this.isVein(worldX, y, worldZ, 1433, 0.955)) {
      return this.toDepthVariant(BlockId.LapisOre, BlockId.DeepslateLapisOre, y);
    }
    if (y <= 20 && this.isVein(worldX, y, worldZ, 1447, 0.95)) {
      return this.toDepthVariant(BlockId.GoldOre, BlockId.DeepslateGoldOre, y);
    }
    if (
      biome === TerrainBiome.Mountains &&
      y >= 6 &&
      y <= 42 &&
      this.isVein(worldX, y, worldZ, 1451, 0.968)
    ) {
      return this.toDepthVariant(BlockId.EmeraldOre, BlockId.DeepslateEmeraldOre, y);
    }
    if (y >= 3 && y <= 38 && this.isVein(worldX, y, worldZ, 1459, 0.89)) {
      return this.toDepthVariant(BlockId.IronOre, BlockId.DeepslateIronOre, y);
    }
    if (y >= 4 && y <= 40 && this.isVein(worldX, y, worldZ, 1471, 0.905)) {
      return this.toDepthVariant(BlockId.CopperOre, BlockId.DeepslateCopperOre, y);
    }
    if (y >= 8 && this.isVein(worldX, y, worldZ, 1481, 0.88)) {
      return this.toDepthVariant(BlockId.CoalOre, BlockId.DeepslateCoalOre, y);
    }
    return null;
  }

  /** Selects a normal or deepslate ore using the frozen profile boundary. */
  private toDepthVariant(normal: BlockId, deepslate: BlockId, y: number): BlockId {
    return toDepthVariant(normal, deepslate, y, this.terrain.deepslateMaximumHeight);
  }

  /** Samples a skewed coordinate plane so adjacent heights can join into small deterministic mineral veins. */
  private isVein(worldX: number, y: number, worldZ: number, salt: number, threshold: number): boolean {
    const broad = this.noise.value2d((worldX + y * 3 + salt) / 3.8, (worldZ - y * 2 - salt) / 3.8);
    const broadUnit = (broad + 1) / 2;
    const detail = this.noise.sampleUnit(worldX + y * 17, worldZ - y * 23, salt);
    return broadUnit * 0.32 + detail * 0.68 > threshold;
  }

  /** Produces broad pockets of familiar rock families after ore placement has had priority. */
  private getRockVariant(worldX: number, y: number, worldZ: number): BlockId | null {
    const sampleX = (worldX + y * 2) / 13;
    const sampleZ = (worldZ - y * 2) / 13;
    if (y > this.terrain.deepslateMaximumHeight && this.noise.value2d(sampleX, sampleZ) > 0.62) {
      return BlockId.Granite;
    }
    if (
      y > this.terrain.deepslateMaximumHeight &&
      this.noise.value2d(sampleX + 310, sampleZ - 210) > 0.64
    ) {
      return BlockId.Diorite;
    }
    if (
      y > this.terrain.deepslateMaximumHeight &&
      this.noise.value2d(sampleX - 170, sampleZ + 270) > 0.63
    ) {
      return BlockId.Andesite;
    }
    if (y <= 22 && this.noise.value2d(sampleX + 510, sampleZ + 130) > 0.6) {
      return BlockId.Tuff;
    }
    if (y >= 12 && this.noise.value2d(sampleX - 430, sampleZ - 360) > 0.68) {
      return BlockId.Calcite;
    }
    if (y >= 8 && y <= 34 && this.noise.value2d(sampleX + 720, sampleZ - 620) > 0.69) {
      return BlockId.Dripstone;
    }
    return null;
  }
}
