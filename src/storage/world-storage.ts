/**
 * Persists a compact world seed and sparse player edits in browser local storage.
 * Generated terrain is never serialized because it can be reconstructed deterministically.
 */

import { BlockId, isBlockId } from "../game/block-types";
import { CHUNK_SIZE, STORAGE_SCHEMA_VERSION } from "../game/game-config";

// A namespaced key avoids collisions with unrelated applications hosted on the same origin.
const STORAGE_KEY = "voxel-frontier.world.v1";

/** SerializedWorld is the only data shape accepted from the untrusted browser storage boundary. */
interface SerializedWorld {
  readonly version: number;
  readonly seed: number;
  readonly edits: Readonly<Record<string, number>>;
}

/** Converts absolute block coordinates into a compact stable map key. */
function coordinateKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Parses a persisted coordinate key and rejects malformed or non-integer values. */
function parseCoordinateKey(key: string): readonly [number, number, number] | null {
  const parts = key.split(",");
  if (parts.length !== 3) {
    return null;
  }
  const coordinates = parts.map(Number);
  if (coordinates.some((value) => !Number.isInteger(value))) {
    return null;
  }
  const [x, y, z] = coordinates;
  return x === undefined || y === undefined || z === undefined ? null : [x, y, z];
}

/** Creates a non-secret random seed, with a time-based fallback for older browser contexts. */
function createSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? Date.now();
  }
  return Date.now() >>> 0;
}

/** Validates the complete saved payload before any values are trusted by game systems. */
function isSerializedWorld(value: unknown): value is SerializedWorld {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SerializedWorld>;
  if (
    candidate.version !== STORAGE_SCHEMA_VERSION ||
    typeof candidate.seed !== "number" ||
    !Number.isInteger(candidate.seed) ||
    typeof candidate.edits !== "object" ||
    candidate.edits === null
  ) {
    return false;
  }
  return Object.entries(candidate.edits).every(
    ([key, blockId]) => parseCoordinateKey(key) !== null && isBlockId(blockId),
  );
}

/** WorldStorage owns validation, sparse edits, and best-effort persistence error handling. */
export class WorldStorage {
  private readonly edits = new Map<string, BlockId>();
  private seed = createSeed();
  private persistent = true;

  public constructor() {
    this.load();
  }

  /** Loads validated data, preserving a fresh in-memory world when storage is absent or corrupt. */
  private load(): void {
    try {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (serialized === null) {
        this.save();
        return;
      }
      const parsed: unknown = JSON.parse(serialized);
      if (!isSerializedWorld(parsed)) {
        console.warn("[WorldStorage] Ignored saved world because its schema or values were invalid.");
        return;
      }
      this.seed = parsed.seed;
      Object.entries(parsed.edits).forEach(([key, blockId]) => {
        this.edits.set(key, blockId as BlockId);
      });
    } catch (error: unknown) {
      this.persistent = false;
      const message = error instanceof Error ? error.message : "Unknown storage error";
      console.error(`[WorldStorage] Saved data could not be loaded: ${message}`);
    }
  }

  /** Serializes the small sparse-edit map and reports whether browser storage accepted it. */
  private save(): boolean {
    try {
      const payload: SerializedWorld = {
        version: STORAGE_SCHEMA_VERSION,
        seed: this.seed,
        edits: Object.fromEntries(this.edits),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.persistent = true;
      return true;
    } catch (error: unknown) {
      this.persistent = false;
      const message = error instanceof Error ? error.message : "Unknown storage error";
      console.error(`[WorldStorage] World changes could not be saved: ${message}`);
      return false;
    }
  }

  /** Returns the stable seed used to regenerate all unedited terrain. */
  public getSeed(): number {
    return this.seed;
  }

  /** Reports whether the most recent local-storage operation succeeded. */
  public isPersistent(): boolean {
    return this.persistent;
  }

  /** Applies every saved edit belonging to a newly generated chunk. */
  public applyEditsToChunk(
    chunkX: number,
    chunkZ: number,
    setBlock: (localX: number, y: number, localZ: number, blockId: BlockId) => void,
  ): void {
    const minX = chunkX * CHUNK_SIZE;
    const minZ = chunkZ * CHUNK_SIZE;

    // Sparse iteration scales with player changes instead of total generated world size.
    this.edits.forEach((blockId, key) => {
      const coordinates = parseCoordinateKey(key);
      if (coordinates === null) {
        return;
      }
      const [x, y, z] = coordinates;
      if (x >= minX && x < minX + CHUNK_SIZE && z >= minZ && z < minZ + CHUNK_SIZE) {
        setBlock(x - minX, y, z - minZ, blockId);
      }
    });
  }

  /** Records or removes one edit, avoiding redundant entries that match generated terrain. */
  public recordEdit(
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    generatedBlockId: BlockId,
  ): boolean {
    const key = coordinateKey(x, y, z);
    if (blockId === generatedBlockId) {
      this.edits.delete(key);
    } else {
      this.edits.set(key, blockId);
    }
    return this.save();
  }
}
