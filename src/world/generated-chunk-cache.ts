/**
 * Retains a bounded least-recently-used set of pristine generated chunks for edit comparisons.
 * Cached chunks are never exposed for player mutation, so they remain authoritative seed-derived baselines.
 */

import type { Chunk } from "./chunk";

/** Converts chunk coordinates into a stable cache key that supports negative positions. */
function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

/** GeneratedChunkCache prevents every block edit from regenerating a complete temporary chunk. */
export class GeneratedChunkCache {
  private readonly chunks = new Map<string, Chunk>();

  public constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("Generated chunk cache capacity must be a positive integer.");
    }
  }

  /** Returns one pristine chunk, creating it once and promoting it to the newest cache position. */
  public getOrCreate(chunkX: number, chunkZ: number, createChunk: () => Chunk): Chunk {
    const key = chunkKey(chunkX, chunkZ);
    const cached = this.chunks.get(key);
    if (cached !== undefined) {
      // Map reinsertion provides deterministic least-recently-used ordering without a second linked structure.
      this.chunks.delete(key);
      this.chunks.set(key, cached);
      return cached;
    }

    const chunk = createChunk();
    this.chunks.set(key, chunk);
    if (this.chunks.size > this.capacity) {
      const oldest = this.chunks.keys().next();
      if (!oldest.done) {
        this.chunks.delete(oldest.value);
      }
    }
    return chunk;
  }

  /** Drops every baseline when the owning generator is disposed or replaced. */
  public clear(): void {
    this.chunks.clear();
  }
}
