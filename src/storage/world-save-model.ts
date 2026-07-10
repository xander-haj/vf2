/**
 * Validates legacy and current serialized world payloads at the browser-storage trust boundary.
 * Migration adds generation identity and entity components without changing any prior-version storage entry.
 */

import { isBlockId } from "../game/block-types";
import type {
  EntityTarget,
  PersistedEntityState,
  PersistedEntityStateV1,
} from "../engine/entities/entity-model";
import {
  LEGACY_WORLD_IDENTITY,
  isWorldGenerationIdentity,
  type WorldGenerationIdentity,
} from "../world/world-profile";

// Version 1 is the historical payload; version 2 adds explicit generation compatibility metadata.
export const LEGACY_WORLD_SAVE_VERSION = 1;
export const GENERATION_WORLD_SAVE_VERSION = 2;
export const CURRENT_WORLD_SAVE_VERSION = 3;

/** SerializedWorldV1 models the exact shape written by the original game release. */
export interface SerializedWorldV1 {
  readonly version: typeof LEGACY_WORLD_SAVE_VERSION;
  readonly seed: number;
  readonly edits: Readonly<Record<string, number>>;
}

/** SerializedWorldV2 models generation-aware saves produced before entity persistence. */
export interface SerializedWorldV2 {
  readonly version: typeof GENERATION_WORLD_SAVE_VERSION;
  readonly generation: WorldGenerationIdentity;
  readonly seed: number;
  readonly edits: Readonly<Record<string, number>>;
}

/** SerializedWorldV3 adds durable NPC state and the player's collected block inventory. */
export interface SerializedWorldV3 {
  readonly version: typeof CURRENT_WORLD_SAVE_VERSION;
  readonly generation: WorldGenerationIdentity;
  readonly seed: number;
  readonly edits: Readonly<Record<string, number>>;
  readonly entities: readonly PersistedEntityState[];
  readonly inventory: Readonly<Record<string, number>>;
}

/** LoadedWorldSave is trusted in-memory data plus the source version used for migration decisions. */
export interface LoadedWorldSave {
  readonly sourceVersion:
    | typeof LEGACY_WORLD_SAVE_VERSION
    | typeof GENERATION_WORLD_SAVE_VERSION
    | typeof CURRENT_WORLD_SAVE_VERSION;
  readonly generation: WorldGenerationIdentity;
  readonly seed: number;
  readonly edits: Readonly<Record<string, number>>;
  readonly entities: readonly PersistedEntityState[];
  readonly inventory: Readonly<Record<string, number>>;
}

/** Converts absolute block coordinates into the stable key retained by both save schema versions. */
export function coordinateKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Parses a persisted coordinate key and rejects malformed or non-integer values. */
export function parseCoordinateKey(key: string): readonly [number, number, number] | null {
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

/** Reports whether a seed can be reproduced safely by the integer-based legacy noise implementation. */
function isSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** Validates every coordinate and byte-sized block identifier in an untrusted sparse edit record. */
function isEditRecord(value: unknown): value is Readonly<Record<string, number>> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.entries(value).every(
    ([key, blockId]) => parseCoordinateKey(key) !== null && isBlockId(blockId),
  );
}

/** Validates finite numeric triples used by entity positions and velocities. */
function isFiniteTriple(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(
    (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)
      && Math.abs(coordinate) <= 30_000_000,
  );
}

/** Rejects executable or nested behavior data at the persistence trust boundary. */
function isBehaviorState(value: unknown): value is Readonly<Record<string, number | string | boolean>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return entries.length <= 256 && entries.every(([key, item]) => key.length <= 160 && (
    (typeof item === "string" && item.length <= 512)
    || typeof item === "boolean"
    || (typeof item === "number" && Number.isFinite(item))
  ));
}

/** Validates the common fields shared by both entity-state migration versions. */
function isLegacyEntityState(value: unknown): value is PersistedEntityStateV1 {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const state = value as Partial<PersistedEntityStateV1>;
  return state.version === 1
    && typeof state.id === "string" && state.id.length > 0 && state.id.length <= 200
    && typeof state.definitionId === "string" && state.definitionId.length > 0
    && state.definitionId.length <= 160
    && isFiniteTriple(state.position)
    && isFiniteTriple(state.velocity)
    && typeof state.yaw === "number" && Number.isFinite(state.yaw)
    && typeof state.health === "number" && Number.isFinite(state.health) && state.health >= 0
    && typeof state.ageSeconds === "number" && Number.isFinite(state.ageSeconds)
    && state.ageSeconds >= 0 && state.ageSeconds <= 1_000_000_000
    && isBehaviorState(state.behaviorState);
}

/** Validates a nullable persisted target reference. */
function isEntityTarget(value: unknown): value is EntityTarget | null {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  const target = value as { readonly kind?: unknown; readonly id?: unknown };
  return target.kind === "player" || (
    target.kind === "entity" && typeof target.id === "string" && target.id.length > 0 && target.id.length <= 200
  );
}

/** Validates a bounded non-negative component timer. */
function isTimer(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}

/** Migrates one validated version-1 component snapshot to the complete version-2 contract. */
function migrateEntityStateV1(state: PersistedEntityStateV1): PersistedEntityState {
  return {
    ...state,
    version: 2,
    definitionVersion: 1,
    grounded: false,
    target: null,
    targetMemorySeconds: 0,
    attackCooldownSeconds: 0,
    navigationCooldownSeconds: 0,
    behaviorAccumulatorSeconds: 0,
    hurtFeedbackSeconds: 0,
    attackAnimationSeconds: 0,
    requestedAnimationId: null,
    requestedAnimationSeconds: 0,
    navigationPath: [],
  };
}

/** Parses and migrates one entity snapshot after validating every current component field. */
function parseEntityState(value: unknown): PersistedEntityState | null {
  if (isLegacyEntityState(value)) return migrateEntityStateV1(value);
  if (typeof value !== "object" || value === null) return null;
  const state = value as Partial<PersistedEntityState>;
  if (
    state.version !== 2
    || typeof state.id !== "string" || state.id.length === 0 || state.id.length > 200
    || typeof state.definitionId !== "string" || state.definitionId.length === 0
    || state.definitionId.length > 160
    || !Number.isSafeInteger(state.definitionVersion) || (state.definitionVersion ?? 0) < 1
    || !isFiniteTriple(state.position) || !isFiniteTriple(state.velocity)
    || typeof state.yaw !== "number" || !Number.isFinite(state.yaw)
    || typeof state.health !== "number" || !Number.isFinite(state.health) || state.health < 0
    || !isTimer(state.ageSeconds) || typeof state.grounded !== "boolean"
    || !isEntityTarget(state.target)
    || !isTimer(state.targetMemorySeconds) || !isTimer(state.attackCooldownSeconds)
    || !isTimer(state.navigationCooldownSeconds) || !isTimer(state.behaviorAccumulatorSeconds)
    || !isTimer(state.hurtFeedbackSeconds) || !isTimer(state.attackAnimationSeconds)
    || (state.requestedAnimationId !== null && (
      typeof state.requestedAnimationId !== "string" || state.requestedAnimationId.length > 160
    ))
    || !isTimer(state.requestedAnimationSeconds)
    || !Array.isArray(state.navigationPath) || state.navigationPath.length > 128
    || !state.navigationPath.every(isFiniteTriple)
    || !isBehaviorState(state.behaviorState)
  ) return null;
  return state as PersistedEntityState;
}

/** Validates inventory keys as block identifiers and quantities as positive bounded integers. */
function isInventoryRecord(value: unknown): value is Readonly<Record<string, number>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).every(([key, count]) => {
    const blockId = Number(key);
    return String(blockId) === key && isBlockId(blockId)
      && Number.isSafeInteger(count) && count > 0 && count <= 1_000_000_000;
  });
}

/** Parses a bounded entity collection and rejects duplicate instance identifiers. */
function parseEntityStateArray(value: unknown): readonly PersistedEntityState[] | null {
  if (!Array.isArray(value) || value.length > 4096) return null;
  const states = value.map(parseEntityState);
  if (states.some((state) => state === null)) return null;
  const parsed = states as PersistedEntityState[];
  return new Set(parsed.map((state) => state.id)).size === parsed.length ? parsed : null;
}

/** Validates and normalizes either supported save version into one trusted in-memory representation. */
export function parseWorldSave(value: unknown): LoadedWorldSave | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as {
    readonly version?: unknown;
    readonly generation?: unknown;
    readonly seed?: unknown;
    readonly edits?: unknown;
    readonly entities?: unknown;
    readonly inventory?: unknown;
  };
  if (!isSeed(candidate.seed) || !isEditRecord(candidate.edits)) {
    return null;
  }
  const entityStates = parseEntityStateArray(candidate.entities);

  // Legacy worlds predate profiles, so their exact original generator identity is assigned during migration.
  if (candidate.version === LEGACY_WORLD_SAVE_VERSION) {
    return {
      sourceVersion: LEGACY_WORLD_SAVE_VERSION,
      generation: LEGACY_WORLD_IDENTITY,
      seed: candidate.seed,
      edits: candidate.edits,
      entities: [],
      inventory: {},
    };
  }
  if (
    candidate.version === GENERATION_WORLD_SAVE_VERSION &&
    isWorldGenerationIdentity(candidate.generation)
  ) {
    return {
      sourceVersion: GENERATION_WORLD_SAVE_VERSION,
      generation: candidate.generation,
      seed: candidate.seed,
      edits: candidate.edits,
      entities: [],
      inventory: {},
    };
  }
  if (
    candidate.version === CURRENT_WORLD_SAVE_VERSION
    && isWorldGenerationIdentity(candidate.generation)
    && entityStates !== null
    && isInventoryRecord(candidate.inventory)
  ) {
    return {
      sourceVersion: CURRENT_WORLD_SAVE_VERSION,
      generation: candidate.generation,
      seed: candidate.seed,
      edits: candidate.edits,
      entities: entityStates,
      inventory: candidate.inventory,
    };
  }
  return null;
}

/** Creates a current-version payload from already validated runtime state. */
export function createSerializedWorld(
  seed: number,
  generation: WorldGenerationIdentity,
  edits: ReadonlyMap<string, number>,
  entities: readonly PersistedEntityState[],
  inventory: Readonly<Record<string, number>>,
): SerializedWorldV3 {
  return {
    version: CURRENT_WORLD_SAVE_VERSION,
    generation,
    seed,
    edits: Object.fromEntries(edits),
    entities,
    inventory,
  };
}
