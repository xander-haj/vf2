/**
 * Stores the compact block grid and current Three.js mesh for one world chunk.
 * Chunk owns geometry lifetime, while the World supplies the shared material and scene membership.
 */

import type { Mesh } from "three";
import { BlockId } from "../game/block-types";
import { CHUNK_SIZE, WORLD_HEIGHT } from "../game/game-config";

// One byte per block is sufficient for the current identifier range and minimizes browser memory use.
const CHUNK_VOLUME = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;

/** Chunk represents a fixed horizontal region addressed by integer chunk coordinates. */
export class Chunk {
  public readonly blocks = new Uint8Array(CHUNK_VOLUME);
  public mesh: Mesh | null = null;

  public constructor(
    public readonly chunkX: number,
    public readonly chunkZ: number,
  ) {}

  /** Converts validated local coordinates into the flat byte-array layout. */
  private getIndex(localX: number, y: number, localZ: number): number {
    return localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * y);
  }

  /** Returns a local block, treating out-of-range coordinates as air instead of reading invalid memory. */
  public getBlock(localX: number, y: number, localZ: number): BlockId {
    if (
      localX < 0 ||
      localX >= CHUNK_SIZE ||
      localZ < 0 ||
      localZ >= CHUNK_SIZE ||
      y < 0 ||
      y >= WORLD_HEIGHT
    ) {
      return BlockId.Air;
    }
    return this.blocks[this.getIndex(localX, y, localZ)] as BlockId;
  }

  /** Writes a local block when coordinates are valid and reports whether the value changed. */
  public setBlock(localX: number, y: number, localZ: number, blockId: BlockId): boolean {
    if (
      localX < 0 ||
      localX >= CHUNK_SIZE ||
      localZ < 0 ||
      localZ >= CHUNK_SIZE ||
      y < 0 ||
      y >= WORLD_HEIGHT
    ) {
      return false;
    }
    const index = this.getIndex(localX, y, localZ);
    if (this.blocks[index] === blockId) {
      return false;
    }
    this.blocks[index] = blockId;
    return true;
  }

  /** Releases only chunk-owned geometry because the world reuses one material across all meshes. */
  public disposeGeometry(): void {
    this.mesh?.geometry.dispose();
    this.mesh = null;
  }
}

