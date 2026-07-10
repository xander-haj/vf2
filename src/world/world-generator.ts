/**
 * Converts a world seed into layered terrain, sandy lowlands, and deterministic trees.
 * Generation is pure with respect to coordinates, allowing unloaded chunks to be recreated exactly.
 */

import { BlockId } from "../game/block-types";
import {
  BASE_TERRAIN_HEIGHT,
  CHUNK_SIZE,
  WORLD_HEIGHT,
} from "../game/game-config";
import { Chunk } from "./chunk";
import { SeededNoise } from "./noise";
import { TerrainBiomeSampler } from "./terrain-biomes";
import { TerrainGeology } from "./terrain-geology";

// Existing trees remain above the lowest valleys so the terrain expansion does not alter their distribution.
const TREE_MINIMUM_SURFACE = BASE_TERRAIN_HEIGHT - 1;

// Tree canopies extend two blocks from their roots, including across chunk boundaries.
const TREE_CANOPY_RADIUS = 2;

/** WorldGenerator creates all unchanged blocks directly from a stable numeric seed. */
export class WorldGenerator {
  private readonly noise: SeededNoise;
  private readonly biomes: TerrainBiomeSampler;
  private readonly geology: TerrainGeology;

  public constructor(public readonly seed: number) {
    this.noise = new SeededNoise(seed);
    this.biomes = new TerrainBiomeSampler(this.noise);
    this.geology = new TerrainGeology(this.noise);
  }

  /** Returns the terrain surface elevation for an absolute horizontal coordinate. */
  public getTerrainHeight(worldX: number, worldZ: number): number {
    const continental = this.noise.fractal2d(worldX / 72, worldZ / 72, 4) * 12;
    const detail = this.noise.fractal2d(worldX / 24, worldZ / 24, 3) * 4;
    return Math.max(4, Math.min(WORLD_HEIGHT - 9, Math.floor(BASE_TERRAIN_HEIGHT + continental + detail)));
  }

  /** Reports whether this surface coordinate is a deterministic tree root. */
  private hasTreeRoot(worldX: number, worldZ: number): boolean {
    const height = this.getTerrainHeight(worldX, worldZ);
    return height > TREE_MINIMUM_SURFACE && this.noise.sampleUnit(worldX, worldZ, 503) > 0.982;
  }

  /** Derives a stable four- or five-block trunk height from the root coordinate. */
  private getTreeHeight(worldX: number, worldZ: number): number {
    return 4 + Math.floor(this.noise.sampleUnit(worldX, worldZ, 887) * 2);
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
    const localX = worldX - chunk.chunkX * CHUNK_SIZE;
    const localZ = worldZ - chunk.chunkZ * CHUNK_SIZE;
    if (localX < 0 || localX >= CHUNK_SIZE || localZ < 0 || localZ >= CHUNK_SIZE) {
      return;
    }
    if (y < 0 || y >= WORLD_HEIGHT) {
      return;
    }
    if (replaceOnlyAir && chunk.getBlock(localX, y, localZ) !== BlockId.Air) {
      return;
    }
    chunk.setBlock(localX, y, localZ, blockId);
  }

  /** Fills biome strata, geological pockets, depth-aware ores, and bedrock into every column. */
  private generateTerrain(chunk: Chunk): void {
    const worldStartX = chunk.chunkX * CHUNK_SIZE;
    const worldStartZ = chunk.chunkZ * CHUNK_SIZE;

    // Each horizontal column is independent, which keeps generation stable regardless of load order.
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
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
    const worldStartX = chunk.chunkX * CHUNK_SIZE;
    const worldStartZ = chunk.chunkZ * CHUNK_SIZE;

    // The expanded root scan makes canopies continuous where a tree overlaps a neighboring chunk.
    const rootEndX = worldStartX + CHUNK_SIZE + TREE_CANOPY_RADIUS;
    const rootEndZ = worldStartZ + CHUNK_SIZE + TREE_CANOPY_RADIUS;
    for (let rootZ = worldStartZ - TREE_CANOPY_RADIUS; rootZ < rootEndZ; rootZ += 1) {
      for (let rootX = worldStartX - TREE_CANOPY_RADIUS; rootX < rootEndX; rootX += 1) {
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
          for (let offsetZ = -TREE_CANOPY_RADIUS; offsetZ <= TREE_CANOPY_RADIUS; offsetZ += 1) {
            for (let offsetX = -TREE_CANOPY_RADIUS; offsetX <= TREE_CANOPY_RADIUS; offsetX += 1) {
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
    this.generateTerrain(chunk);
    this.generateTrees(chunk);
  }

  /** Returns the generated block before player edits, used to remove redundant saved changes. */
  public getGeneratedBlock(worldX: number, y: number, worldZ: number): BlockId {
    if (y < 0) {
      return BlockId.Stone;
    }
    if (y >= WORLD_HEIGHT) {
      return BlockId.Air;
    }
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const chunk = new Chunk(chunkX, chunkZ);
    this.generateChunk(chunk);
    const localX = worldX - chunkX * CHUNK_SIZE;
    const localZ = worldZ - chunkZ * CHUNK_SIZE;
    return chunk.getBlock(localX, y, localZ);
  }
}
