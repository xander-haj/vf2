/**
 * Persists a versioned generation identity, world seed, and sparse player edits in browser local storage.
 * Legacy data is migrated to a separate key so the original save remains available as a rollback source.
 */

import { BlockId } from "../game/block-types";
import type { PersistedEntityState } from "../engine/entities/entity-model";
import {
  coordinateKey,
  createSerializedWorld,
  parseCoordinateKey,
  parseWorldSave,
  type LoadedWorldSave,
} from "./world-save-model";
import {
  ENGINE_WORLD_IDENTITY,
  type WorldGenerationIdentity,
} from "../world/world-profile";

// Versioned keys keep migration non-destructive and prevent new data from replacing the legacy rollback source.
const LEGACY_STORAGE_KEY = "voxel-frontier.world.v1";
const GENERATION_STORAGE_KEY = "voxel-frontier.world.v2";
const CURRENT_STORAGE_KEY = "voxel-frontier.world.v3";

/** Creates a non-secret random seed, with a time-based fallback for older browser contexts. */
function createSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? Date.now();
  }
  return Date.now() >>> 0;
}

/** WorldStorage owns validation, sparse edits, and best-effort persistence error handling. */
export class WorldStorage {
  private readonly edits = new Map<string, BlockId>();
  private entityStates: readonly PersistedEntityState[] = [];
  private inventory: Readonly<Record<string, number>> = {};
  private seed = createSeed();
  private generation: WorldGenerationIdentity = ENGINE_WORLD_IDENTITY;
  private persistent = true;
  private writesBlocked = false;

  public constructor() {
    this.load();
  }

  /** Parses one stored value without allowing malformed JSON or schema data into runtime state. */
  private readStoredWorld(key: string): LoadedWorldSave | null {
    const serialized = window.localStorage.getItem(key);
    if (serialized === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(serialized);
    return parseWorldSave(parsed);
  }

  /** Copies one trusted save into runtime state without mutating either storage key. */
  private applyLoadedWorld(world: LoadedWorldSave): void {
    this.seed = world.seed;
    this.generation = world.generation;
    this.entityStates = world.entities;
    this.inventory = world.inventory;
    Object.entries(world.edits).forEach(([key, blockId]) => {
      this.edits.set(key, blockId as BlockId);
    });
  }

  /** Loads current data first, then migrates legacy data without overwriting its original storage entry. */
  private load(): void {
    try {
      const currentSerialized = window.localStorage.getItem(CURRENT_STORAGE_KEY);
      if (currentSerialized !== null) {
        const current = this.readStoredWorld(CURRENT_STORAGE_KEY);
        if (current === null || current.sourceVersion !== 3) {
          this.persistent = false;
          this.writesBlocked = true;
          console.error("[WorldStorage] Current world data is invalid; writes are blocked to preserve it.");
          return;
        }
        this.applyLoadedWorld(current);
        return;
      }

      const generationSerialized = window.localStorage.getItem(GENERATION_STORAGE_KEY);
      if (generationSerialized !== null) {
        const generation = this.readStoredWorld(GENERATION_STORAGE_KEY);
        if (generation === null || generation.sourceVersion !== 2) {
          this.persistent = false;
          this.writesBlocked = true;
          console.error("[WorldStorage] Version-2 world data is invalid; migration was not attempted.");
          return;
        }
        this.applyLoadedWorld(generation);
        this.save();
        return;
      }

      const legacySerialized = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacySerialized !== null) {
        const legacy = this.readStoredWorld(LEGACY_STORAGE_KEY);
        if (legacy === null || legacy.sourceVersion !== 1) {
          this.persistent = false;
          this.writesBlocked = true;
          console.error("[WorldStorage] Legacy world data is invalid; migration was not attempted.");
          return;
        }
        this.applyLoadedWorld(legacy);
        this.save();
        return;
      }
      this.save();
    } catch (error: unknown) {
      this.persistent = false;
      this.writesBlocked = true;
      const message = error instanceof Error ? error.message : "Unknown storage error";
      console.error(`[WorldStorage] Saved data could not be loaded: ${message}`);
    }
  }

  /** Serializes current data unless invalid existing storage has deliberately blocked destructive writes. */
  private save(): boolean {
    if (this.writesBlocked) {
      return false;
    }
    try {
      const payload = createSerializedWorld(
        this.seed,
        this.generation,
        this.edits,
        this.entityStates,
        this.inventory,
      );
      window.localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify(payload));
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

  /** Returns the persisted compatibility identity used to resolve the exact terrain profile. */
  public getWorldGenerationIdentity(): WorldGenerationIdentity {
    return this.generation;
  }

  /** Returns the validated immutable NPC snapshots owned by this world save. */
  public getEntityStates(): readonly PersistedEntityState[] {
    return this.entityStates;
  }

  /** Returns the validated collected-block inventory associated with this world. */
  public getInventoryState(): Readonly<Record<string, number>> {
    return this.inventory;
  }

  /** Atomically replaces durable entity and inventory snapshots, then persists the complete world. */
  public recordEntityState(
    states: readonly PersistedEntityState[],
    inventory: Readonly<Record<string, number>>,
  ): boolean {
    this.entityStates = states.map((state): PersistedEntityState => ({
      ...state,
      position: [state.position[0], state.position[1], state.position[2]],
      velocity: [state.velocity[0], state.velocity[1], state.velocity[2]],
      target: state.target === null ? null : { ...state.target },
      navigationPath: state.navigationPath.map(
        (point): [number, number, number] => [point[0], point[1], point[2]],
      ),
      behaviorState: { ...state.behaviorState },
    }));
    this.inventory = { ...inventory };
    return this.save();
  }

  /** Reports whether the most recent local-storage operation succeeded. */
  public isPersistent(): boolean {
    return this.persistent;
  }

  /** Applies every saved edit belonging to a newly generated chunk. */
  public applyEditsToChunk(
    chunkX: number,
    chunkZ: number,
    chunkSize: number,
    setBlock: (localX: number, y: number, localZ: number, blockId: BlockId) => void,
  ): void {
    const minX = chunkX * chunkSize;
    const minZ = chunkZ * chunkSize;

    // Sparse iteration scales with player changes instead of total generated world size.
    this.edits.forEach((blockId, key) => {
      const coordinates = parseCoordinateKey(key);
      if (coordinates === null) {
        return;
      }
      const [x, y, z] = coordinates;
      if (x >= minX && x < minX + chunkSize && z >= minZ && z < minZ + chunkSize) {
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
