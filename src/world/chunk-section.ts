/**
 * Stores one bounded vertical slice of chunk blocks and owns that slice's Three.js mesh geometry.
 * Section ownership limits future block edits to rebuilding a small vertical region instead of a full column.
 */

import type { Mesh } from "three";
import { BlockId } from "../game/block-types";

/** ChunkSection stores byte-sized block identifiers for one fixed vertical range. */
export class ChunkSection {
  private readonly blocks: Uint8Array;
  public mesh: Mesh | null = null;

  public constructor(
    public readonly sectionIndex: number,
    private readonly chunkSize: number,
    private readonly sectionHeight: number,
  ) {
    // One byte per cell preserves the existing block-ID representation while reducing remesh ownership.
    const sectionVolume = chunkSize * sectionHeight * chunkSize;
    this.blocks = new Uint8Array(sectionVolume);
  }

  /** Converts validated section-local coordinates into the flat byte-array layout. */
  private getIndex(localX: number, localY: number, localZ: number): number {
    return localX + this.chunkSize * (localZ + this.chunkSize * localY);
  }

  /** Returns one section-local block, treating invalid coordinates as air. */
  public getBlock(localX: number, localY: number, localZ: number): BlockId {
    if (
      localX < 0 ||
      localX >= this.chunkSize ||
      localZ < 0 ||
      localZ >= this.chunkSize ||
      localY < 0 ||
      localY >= this.sectionHeight
    ) {
      return BlockId.Air;
    }
    return this.blocks[this.getIndex(localX, localY, localZ)] as BlockId;
  }

  /** Writes a valid section-local block and reports whether the stored byte changed. */
  public setBlock(localX: number, localY: number, localZ: number, blockId: BlockId): boolean {
    if (
      localX < 0 ||
      localX >= this.chunkSize ||
      localZ < 0 ||
      localZ >= this.chunkSize ||
      localY < 0 ||
      localY >= this.sectionHeight
    ) {
      return false;
    }
    const index = this.getIndex(localX, localY, localZ);
    if (this.blocks[index] === blockId) {
      return false;
    }
    this.blocks[index] = blockId;
    return true;
  }

  /** Releases section-owned geometry while leaving the world's shared material untouched. */
  public disposeGeometry(): void {
    this.mesh?.geometry.dispose();
    this.mesh = null;
  }
}
