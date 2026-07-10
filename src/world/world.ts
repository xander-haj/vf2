/**
 * Coordinates chunk streaming, generation, meshing, block lookup, edits, and resource cleanup.
 * World is the authoritative boundary used by physics, interaction, and rendering systems.
 */

import { type Material, Scene, Vector3 } from "three";
import { BlockId, isSolidBlock } from "../game/block-types";
import {
  CHUNK_SIZE,
  RENDER_DISTANCE,
  WORLD_HEIGHT,
} from "../game/game-config";
import type { TextureAtlas } from "../game/texture-atlas";
import type { WorldStorage } from "../storage/world-storage";
import { Chunk } from "./chunk";
import { ChunkMesher } from "./chunk-mesher";
import { WorldGenerator } from "./world-generator";

// Horizontal neighbor offsets identify chunk meshes affected by border changes.
const CHUNK_NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Converts chunk coordinates into a stable map key that supports negative positions. */
function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

/** Converts an absolute coordinate to its containing chunk using floor division. */
function worldToChunk(coordinate: number): number {
  return Math.floor(coordinate / CHUNK_SIZE);
}

/** World keeps only nearby chunks resident and remeshes exactly the regions affected by edits. */
export class World {
  private readonly chunks = new Map<string, Chunk>();
  private readonly generator: WorldGenerator;
  private readonly mesher: ChunkMesher;
  private lastCenterChunk: string | null = null;

  public constructor(
    private readonly scene: Scene,
    material: Material,
    atlas: TextureAtlas,
    private readonly storage: WorldStorage,
  ) {
    this.generator = new WorldGenerator(storage.getSeed());
    this.mesher = new ChunkMesher(material, atlas);
  }

  /** Creates deterministic block data and overlays saved player changes without building a mesh yet. */
  private createChunk(chunkX: number, chunkZ: number): Chunk {
    const chunk = new Chunk(chunkX, chunkZ);
    this.generator.generateChunk(chunk);
    this.storage.applyEditsToChunk(chunkX, chunkZ, (localX, y, localZ, blockId) => {
      chunk.setBlock(localX, y, localZ, blockId);
    });
    this.chunks.set(chunkKey(chunkX, chunkZ), chunk);
    return chunk;
  }

  /** Replaces one chunk mesh while preserving the shared atlas material. */
  private rebuildChunk(chunk: Chunk): void {
    if (chunk.mesh !== null) {
      this.scene.remove(chunk.mesh);
      chunk.disposeGeometry();
    }
    chunk.mesh = this.mesher.buildMesh(chunk, (x, y, z) => this.getBlock(x, y, z));
    this.scene.add(chunk.mesh);
  }

  /** Adds a chunk and its four horizontal neighbors to a deduplicated remesh set. */
  private markChunkAndNeighbors(
    affected: Set<string>,
    chunkX: number,
    chunkZ: number,
  ): void {
    affected.add(chunkKey(chunkX, chunkZ));
    CHUNK_NEIGHBORS.forEach(([offsetX, offsetZ]) => {
      affected.add(chunkKey(chunkX + offsetX, chunkZ + offsetZ));
    });
  }

  /** Loads and unloads chunks when the player enters a new chunk, then repairs affected borders. */
  public updateStreaming(playerPosition: Vector3): void {
    const centerX = worldToChunk(playerPosition.x);
    const centerZ = worldToChunk(playerPosition.z);
    const centerKey = chunkKey(centerX, centerZ);
    if (centerKey === this.lastCenterChunk) {
      return;
    }
    this.lastCenterChunk = centerKey;
    const desired = new Set<string>();
    const affected = new Set<string>();
    const coordinates: Array<readonly [number, number, number]> = [];

    // Distance sorting loads the visible center first and makes initial generation feel immediate.
    for (let offsetZ = -RENDER_DISTANCE; offsetZ <= RENDER_DISTANCE; offsetZ += 1) {
      for (let offsetX = -RENDER_DISTANCE; offsetX <= RENDER_DISTANCE; offsetX += 1) {
        coordinates.push([centerX + offsetX, centerZ + offsetZ, offsetX * offsetX + offsetZ * offsetZ]);
      }
    }
    coordinates.sort((left, right) => left[2] - right[2]);
    coordinates.forEach(([chunkX, chunkZ]) => {
      const key = chunkKey(chunkX, chunkZ);
      desired.add(key);
      if (!this.chunks.has(key)) {
        this.createChunk(chunkX, chunkZ);
        this.markChunkAndNeighbors(affected, chunkX, chunkZ);
      }
    });

    // Chunks outside the exact desired square are removed to keep memory and draw calls bounded.
    this.chunks.forEach((chunk, key) => {
      if (desired.has(key)) {
        return;
      }
      if (chunk.mesh !== null) {
        this.scene.remove(chunk.mesh);
      }
      chunk.disposeGeometry();
      this.chunks.delete(key);
      this.markChunkAndNeighbors(affected, chunk.chunkX, chunk.chunkZ);
    });

    // Remeshing after all data changes ensures border queries see the final loaded set.
    affected.forEach((key) => {
      const chunk = this.chunks.get(key);
      if (chunk !== undefined) {
        this.rebuildChunk(chunk);
      }
    });
  }

  /** Returns a world block, with solid bedrock-like space below and empty space above the height limit. */
  public getBlock(worldX: number, y: number, worldZ: number): BlockId {
    const integerX = Math.floor(worldX);
    const integerY = Math.floor(y);
    const integerZ = Math.floor(worldZ);
    if (integerY < 0) {
      return BlockId.Stone;
    }
    if (integerY >= WORLD_HEIGHT) {
      return BlockId.Air;
    }
    const chunkX = worldToChunk(integerX);
    const chunkZ = worldToChunk(integerZ);
    const chunk = this.chunks.get(chunkKey(chunkX, chunkZ));
    if (chunk === undefined) {
      return BlockId.Air;
    }
    return chunk.getBlock(integerX - chunkX * CHUNK_SIZE, integerY, integerZ - chunkZ * CHUNK_SIZE);
  }

  /** Reports whether the requested world cell blocks player movement. */
  public isSolid(worldX: number, y: number, worldZ: number): boolean {
    return isSolidBlock(this.getBlock(worldX, y, worldZ));
  }

  /** Applies a player edit, persists it, and rebuilds the edited chunk plus any touched border neighbor. */
  public setBlock(worldX: number, y: number, worldZ: number, blockId: BlockId): boolean {
    const integerX = Math.floor(worldX);
    const integerY = Math.floor(y);
    const integerZ = Math.floor(worldZ);
    if (integerY < 0 || integerY >= WORLD_HEIGHT) {
      return false;
    }
    const chunkX = worldToChunk(integerX);
    const chunkZ = worldToChunk(integerZ);
    const chunk = this.chunks.get(chunkKey(chunkX, chunkZ));
    if (chunk === undefined) {
      return false;
    }
    const localX = integerX - chunkX * CHUNK_SIZE;
    const localZ = integerZ - chunkZ * CHUNK_SIZE;
    if (!chunk.setBlock(localX, integerY, localZ, blockId)) {
      return false;
    }
    const generated = this.generator.getGeneratedBlock(integerX, integerY, integerZ);
    this.storage.recordEdit(integerX, integerY, integerZ, blockId, generated);
    this.rebuildChunk(chunk);

    // Border edits expose or hide faces in exactly one neighboring chunk along each touched axis.
    CHUNK_NEIGHBORS.forEach(([offsetX, offsetZ]) => {
      const touchesX = offsetX === -1 ? localX === 0 : offsetX === 1 ? localX === CHUNK_SIZE - 1 : true;
      const touchesZ = offsetZ === -1 ? localZ === 0 : offsetZ === 1 ? localZ === CHUNK_SIZE - 1 : true;
      if (touchesX && touchesZ) {
        const neighbor = this.chunks.get(chunkKey(chunkX + offsetX, chunkZ + offsetZ));
        if (neighbor !== undefined) {
          this.rebuildChunk(neighbor);
        }
      }
    });
    return true;
  }

  /** Finds a safe loaded spawn point by scanning nearby columns for their highest solid surface. */
  public findSpawn(): Vector3 {
    this.updateStreaming(new Vector3(0, 0, 0));

    // Expanding rings prefer the origin while still avoiding an unusually tall nearby tree crown.
    for (let radius = 0; radius <= 12; radius += 1) {
      for (let z = -radius; z <= radius; z += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          if (radius > 0 && Math.abs(x) !== radius && Math.abs(z) !== radius) {
            continue;
          }
          for (let y = WORLD_HEIGHT - 3; y >= 0; y -= 1) {
            if (this.isSolid(x, y, z) && !this.isSolid(x, y + 1, z) && !this.isSolid(x, y + 2, z)) {
              return new Vector3(x + 0.5, y + 1.01, z + 0.5);
            }
          }
        }
      }
    }
    return new Vector3(0.5, WORLD_HEIGHT - 2, 0.5);
  }

  /** Reports whether save operations remain available after the latest world edit. */
  public isPersistent(): boolean {
    return this.storage.isPersistent();
  }

  /** Releases chunk geometry when the game shuts down or initialization is rolled back. */
  public dispose(): void {
    this.chunks.forEach((chunk) => {
      if (chunk.mesh !== null) {
        this.scene.remove(chunk.mesh);
      }
      chunk.disposeGeometry();
    });
    this.chunks.clear();
  }
}
