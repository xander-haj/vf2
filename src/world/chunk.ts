/**
 * Routes one chunk column across compact vertical sections with independently owned mesh geometry.
 * World coordinates remain unchanged while section boundaries reduce storage and remeshing scope.
 */

import { BlockId } from "../game/block-types";
import { ChunkSection } from "./chunk-section";
import type { WorldDimensions } from "./world-profile";

/** Chunk represents a fixed horizontal region addressed by integer chunk coordinates. */
export class Chunk {
  public readonly sections: readonly ChunkSection[];

  public constructor(
    public readonly chunkX: number,
    public readonly chunkZ: number,
    public readonly dimensions: WorldDimensions,
  ) {
    const sectionCount = dimensions.worldHeight / dimensions.sectionHeight;
    this.sections = Array.from(
      { length: sectionCount },
      (_, sectionIndex) => new ChunkSection(
        sectionIndex,
        dimensions.chunkSize,
        dimensions.sectionHeight,
      ),
    );
  }

  /** Returns the section containing an absolute chunk-local Y coordinate, or null outside the world. */
  public getSectionForY(y: number): ChunkSection | null {
    if (y < 0 || y >= this.dimensions.worldHeight) {
      return null;
    }
    const sectionIndex = Math.floor(y / this.dimensions.sectionHeight);
    return this.sections[sectionIndex] ?? null;
  }

  /** Returns a local block, treating out-of-range coordinates as air instead of reading invalid memory. */
  public getBlock(localX: number, y: number, localZ: number): BlockId {
    if (
      localX < 0 ||
      localX >= this.dimensions.chunkSize ||
      localZ < 0 ||
      localZ >= this.dimensions.chunkSize ||
      y < 0 ||
      y >= this.dimensions.worldHeight
    ) {
      return BlockId.Air;
    }
    const section = this.getSectionForY(y);
    if (section === null) {
      return BlockId.Air;
    }
    const localY = y - section.sectionIndex * this.dimensions.sectionHeight;
    return section.getBlock(localX, localY, localZ);
  }

  /** Writes a local block when coordinates are valid and reports whether the value changed. */
  public setBlock(localX: number, y: number, localZ: number, blockId: BlockId): boolean {
    if (
      localX < 0 ||
      localX >= this.dimensions.chunkSize ||
      localZ < 0 ||
      localZ >= this.dimensions.chunkSize ||
      y < 0 ||
      y >= this.dimensions.worldHeight
    ) {
      return false;
    }
    const section = this.getSectionForY(y);
    if (section === null) {
      return false;
    }
    const localY = y - section.sectionIndex * this.dimensions.sectionHeight;
    return section.setBlock(localX, localY, localZ, blockId);
  }

  /** Releases all section geometry because the world reuses one material across every chunk mesh. */
  public disposeGeometry(): void {
    this.sections.forEach((section) => section.disposeGeometry());
  }
}
