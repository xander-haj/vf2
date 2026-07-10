/**
 * Converts a world seed into layered terrain, sandy lowlands, and deterministic trees.
 * Generation is pure with respect to coordinates, allowing unloaded chunks to be recreated exactly.
 */

import { BlockId } from "../game/block-types";
import {
  EngineWorldGenerator,
  type CoordinateGenerationExplanation,
} from "../engine/worldgen/engine-world-generator";
import { Chunk } from "./chunk";
import { GeneratedChunkCache } from "./generated-chunk-cache";
import { SeededNoise } from "./noise";
import { TerrainBiome, TerrainBiomeSampler } from "./terrain-biomes";
import { TerrainGeology } from "./terrain-geology";
import type { WorldProfile } from "./world-profile";

// Eight pristine chunks cover repeated edits near the player without retaining an unbounded second world copy.
const GENERATED_CHUNK_CACHE_CAPACITY = 8;

const LEGACY_BIOME_IDS: Readonly<Record<TerrainBiome, string>> = {
  [TerrainBiome.Plains]: "vf:plains",
  [TerrainBiome.Desert]: "vf:desert",
  [TerrainBiome.Badlands]: "vf:badlands",
  [TerrainBiome.Snowy]: "vf:snowy",
  [TerrainBiome.Gravelly]: "vf:gravelly",
  [TerrainBiome.Mushroom]: "vf:mushroom",
  [TerrainBiome.Taiga]: "vf:taiga",
  [TerrainBiome.Marsh]: "vf:marsh",
  [TerrainBiome.Lush]: "vf:lush",
  [TerrainBiome.Mountains]: "vf:mountains",
};

/** WorldGenerator creates all unchanged blocks directly from a stable numeric seed. */
export class WorldGenerator {
  private readonly noise: SeededNoise;
  private readonly biomes: TerrainBiomeSampler;
  private readonly geology: TerrainGeology;
  private readonly engineGenerator: EngineWorldGenerator | null;
  private readonly generatedChunks = new GeneratedChunkCache(GENERATED_CHUNK_CACHE_CAPACITY);

  public constructor(
    public readonly seed: number,
    private readonly profile: WorldProfile,
  ) {
    this.noise = new SeededNoise(seed);
    this.biomes = new TerrainBiomeSampler(this.noise, profile.terrain);
    this.geology = new TerrainGeology(this.noise, profile.terrain);
    this.engineGenerator = profile.engine === undefined
      ? null
      : new EngineWorldGenerator(
        seed,
        profile.engine,
        profile.dimensions.chunkSize,
        profile.dimensions.worldHeight,
        profile.dimensions.sectionHeight,
      );
  }

  /** Returns the terrain surface elevation for an absolute horizontal coordinate. */
  public getTerrainHeight(worldX: number, worldZ: number): number {
    if (this.engineGenerator !== null) {
      return this.engineGenerator.getTerrainHeight(worldX, worldZ);
    }
    const continental = this.noise.fractal2d(worldX / 72, worldZ / 72, 4) * 12;
    const detail = this.noise.fractal2d(worldX / 24, worldZ / 24, 3) * 4;
    const minimum = this.profile.terrain.minimumHeight;
    const maximum = this.profile.dimensions.worldHeight - this.profile.terrain.topMargin;
    return Math.max(
      minimum,
      Math.min(maximum, Math.floor(this.profile.terrain.baseHeight + continental + detail)),
    );
  }

  /** Returns the stable generated biome identifier used by spawn and editor diagnostics. */
  public getBiomeId(worldX: number, worldZ: number): string {
    if (this.engineGenerator !== null) {
      return this.engineGenerator.getBiome(worldX, worldZ).id;
    }
    const biome = this.biomes.getBiome(worldX, worldZ, this.getTerrainHeight(worldX, worldZ));
    return LEGACY_BIOME_IDS[biome];
  }

  /** Returns an ordered engine-v2 pass explanation, or null for the frozen opaque legacy generator. */
  public explainCoordinate(
    worldX: number,
    y: number,
    worldZ: number,
  ): CoordinateGenerationExplanation | null {
    return this.engineGenerator?.explainCoordinate(worldX, y, worldZ) ?? null;
  }

  /** Reports whether this surface coordinate is a deterministic tree root. */
  private hasTreeRoot(worldX: number, worldZ: number): boolean {
    const height = this.getTerrainHeight(worldX, worldZ);
    const minimumSurface = this.profile.terrain.baseHeight + this.profile.trees.minimumSurfaceOffset;
    return (
      height > minimumSurface &&
      this.noise.sampleUnit(worldX, worldZ, this.profile.trees.rootSalt) > this.profile.trees.rootThreshold
    );
  }

  /** Derives a stable four- or five-block trunk height from the root coordinate. */
  private getTreeHeight(worldX: number, worldZ: number): number {
    return (
      this.profile.trees.minimumTrunkHeight +
      Math.floor(
        this.noise.sampleUnit(worldX, worldZ, this.profile.trees.heightSalt) *
        this.profile.trees.trunkHeightRange,
      )
    );
  }

  /** Writes an absolute coordinate only when it falls inside the chunk currently being generated. */
  private setIfInside(
    chunk: Chunk,
    worldX: number,
    y: number,
    worldZ: number,
    blockId: BlockId,
    replaceOnlyAir: boolean,
  ): void {
    const { chunkSize, worldHeight } = this.profile.dimensions;
    const localX = worldX - chunk.chunkX * chunkSize;
    const localZ = worldZ - chunk.chunkZ * chunkSize;
    if (localX < 0 || localX >= chunkSize || localZ < 0 || localZ >= chunkSize) {
      return;
    }
    if (y < 0 || y >= worldHeight) {
      return;
    }
    if (replaceOnlyAir && chunk.getBlock(localX, y, localZ) !== BlockId.Air) {
      return;
    }
    chunk.setBlock(localX, y, localZ, blockId);
  }

  /** Fills biome strata, geological pockets, depth-aware ores, and bedrock into every column. */
  private generateTerrain(chunk: Chunk): void {
    const chunkSize = this.profile.dimensions.chunkSize;
    const worldStartX = chunk.chunkX * chunkSize;
    const worldStartZ = chunk.chunkZ * chunkSize;

    // Each horizontal column is independent, which keeps generation stable regardless of load order.
    for (let localZ = 0; localZ < chunkSize; localZ += 1) {
      for (let localX = 0; localX < chunkSize; localX += 1) {
        const worldX = worldStartX + localX;
        const worldZ = worldStartZ + localZ;
        const surface = this.getTerrainHeight(worldX, worldZ);
        const biome = this.biomes.getBiome(worldX, worldZ, surface);

        // Biome layers control visible ground while the shared geology supplies every deeper coordinate.
        for (let y = 0; y <= surface; y += 1) {
          const surfaceLayer = this.biomes.getSurfaceLayer(biome, surface - y, worldX, worldZ, surface);
          const blockId = surfaceLayer ?? this.geology.getBlock(worldX, y, worldZ, biome);
          chunk.setBlock(localX, y, localZ, blockId);
        }
      }
    }
  }

  /** Adds trunks and rounded leaf crowns, including tree roots located just beyond chunk borders. */
  private generateTrees(chunk: Chunk): void {
    const chunkSize = this.profile.dimensions.chunkSize;
    const canopyRadius = this.profile.trees.canopyRadius;
    const worldStartX = chunk.chunkX * chunkSize;
    const worldStartZ = chunk.chunkZ * chunkSize;

    // The expanded root scan makes canopies continuous where a tree overlaps a neighboring chunk.
    const rootEndX = worldStartX + chunkSize + canopyRadius;
    const rootEndZ = worldStartZ + chunkSize + canopyRadius;
    for (let rootZ = worldStartZ - canopyRadius; rootZ < rootEndZ; rootZ += 1) {
      for (let rootX = worldStartX - canopyRadius; rootX < rootEndX; rootX += 1) {
        if (!this.hasTreeRoot(rootX, rootZ)) {
          continue;
        }
        const surface = this.getTerrainHeight(rootX, rootZ);
        const treeHeight = this.getTreeHeight(rootX, rootZ);

        // Trunks replace only air so neighboring terrain always remains authoritative.
        for (let y = surface + 1; y <= surface + treeHeight; y += 1) {
          this.setIfInside(chunk, rootX, y, rootZ, BlockId.Wood, true);
        }

        // Manhattan trimming removes canopy corners and creates a compact rounded crown.
        for (let offsetY = -2; offsetY <= 1; offsetY += 1) {
          for (let offsetZ = -canopyRadius; offsetZ <= canopyRadius; offsetZ += 1) {
            for (let offsetX = -canopyRadius; offsetX <= canopyRadius; offsetX += 1) {
              if (Math.abs(offsetX) + Math.abs(offsetZ) > 3) {
                continue;
              }
              this.setIfInside(
                chunk,
                rootX + offsetX,
                surface + treeHeight + offsetY,
                rootZ + offsetZ,
                BlockId.Leaves,
                true,
              );
            }
          }
        }
      }
    }
  }

  /** Populates a fresh chunk completely, first establishing terrain and then decorations. */
  public generateChunk(chunk: Chunk): void {
    if (this.engineGenerator !== null) {
      this.engineGenerator.generateChunk(chunk);
      return;
    }
    this.generateTerrain(chunk);
    this.generateTrees(chunk);
  }

  /** Returns the generated block before player edits, used to remove redundant saved changes. */
  public getGeneratedBlock(worldX: number, y: number, worldZ: number): BlockId {
    if (y < 0) {
      return BlockId.Stone;
    }
    const { chunkSize, worldHeight } = this.profile.dimensions;
    if (y >= worldHeight) {
      return BlockId.Air;
    }
    const chunkX = Math.floor(worldX / chunkSize);
    const chunkZ = Math.floor(worldZ / chunkSize);
    const chunk = this.generatedChunks.getOrCreate(chunkX, chunkZ, () => {
      const generated = new Chunk(chunkX, chunkZ, this.profile.dimensions);
      this.generateChunk(generated);
      return generated;
    });
    const localX = worldX - chunkX * chunkSize;
    const localZ = worldZ - chunkZ * chunkSize;
    return chunk.getBlock(localX, y, localZ);
  }

  /** Releases cached pristine chunks when their generation profile is no longer active. */
  public dispose(): void {
    this.generatedChunks.clear();
  }
}
