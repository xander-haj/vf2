/**
 * Defines versioned world-generation profiles and resolves saved identities to supported runtime data.
 * A profile freezes every dimension and terrain value that must remain stable for an existing seed.
 */

import type { EngineWorldgenProfile } from "../engine/worldgen/generation-context";
import { ENGINE_WORLDGEN_PROFILE } from "../generated/engine-worldgen-registry";

/** WorldGenerationIdentity is persisted so a seed is never interpreted by an incompatible generator. */
export interface WorldGenerationIdentity {
  readonly profileId: string;
  readonly generatorVersion: number;
  readonly contentRegistryVersion: number;
}

/** WorldDimensions controls chunk addressing, vertical storage partitioning, and valid block coordinates. */
export interface WorldDimensions {
  readonly chunkSize: number;
  readonly worldHeight: number;
  readonly sectionHeight: number;
}

/** TerrainProfile freezes values that participate directly in deterministic block generation. */
export interface TerrainProfile {
  readonly baseHeight: number;
  readonly minimumHeight: number;
  readonly topMargin: number;
  readonly bedrockMaximumHeight: number;
  readonly deepslateMaximumHeight: number;
}

/** TreeProfile freezes deterministic placement, dimensions, and random-stream salts for legacy trees. */
export interface TreeProfile {
  readonly minimumSurfaceOffset: number;
  readonly canopyRadius: number;
  readonly minimumTrunkHeight: number;
  readonly trunkHeightRange: number;
  readonly rootSalt: number;
  readonly rootThreshold: number;
  readonly heightSalt: number;
}

/** WorldProfile combines compatibility identity with every value needed by storage and generation. */
export interface WorldProfile {
  readonly identity: WorldGenerationIdentity;
  readonly dimensions: WorldDimensions;
  readonly renderDistance: number;
  readonly terrain: TerrainProfile;
  readonly trees: TreeProfile;
  readonly engine?: EngineWorldgenProfile;
}

// This identity permanently names the exact generator shipped with schema-version-1 browser saves.
export const LEGACY_WORLD_IDENTITY: WorldGenerationIdentity = {
  profileId: "vf:legacy_v1",
  generatorVersion: 1,
  contentRegistryVersion: 1,
};

// These values mirror the original game constants exactly so existing seeds retain identical untouched terrain.
export const LEGACY_WORLD_PROFILE: WorldProfile = {
  identity: LEGACY_WORLD_IDENTITY,
  dimensions: {
    chunkSize: 16,
    worldHeight: 64,
    sectionHeight: 16,
  },
  renderDistance: 2,
  terrain: {
    baseHeight: 25,
    minimumHeight: 4,
    topMargin: 9,
    bedrockMaximumHeight: 2,
    deepslateMaximumHeight: 14,
  },
  trees: {
    minimumSurfaceOffset: -1,
    canopyRadius: 2,
    minimumTrunkHeight: 4,
    trunkHeightRange: 2,
    rootSalt: 503,
    rootThreshold: 0.982,
    heightSalt: 887,
  },
};

/** This identity names the first data-driven density, cave, aquifer, feature, and structure pipeline. */
export const ENGINE_WORLD_IDENTITY: WorldGenerationIdentity = {
  profileId: "vf:engine_v2",
  generatorVersion: 2,
  contentRegistryVersion: 2,
};

/** Engine-v2 keeps shared dimension fields beside its generated world-generation content snapshot. */
export const ENGINE_WORLD_PROFILE: WorldProfile = {
  identity: ENGINE_WORLD_IDENTITY,
  dimensions: {
    chunkSize: 16,
    worldHeight: 128,
    sectionHeight: 16,
  },
  renderDistance: 3,
  terrain: {
    baseHeight: 50,
    minimumHeight: 3,
    topMargin: 8,
    bedrockMaximumHeight: 3,
    deepslateMaximumHeight: 31,
  },
  // Retained only for the shared legacy-generator adapter; engine-v2 decorations own tree placement.
  trees: {
    minimumSurfaceOffset: 0,
    canopyRadius: 3,
    minimumTrunkHeight: 4,
    trunkHeightRange: 4,
    rootSalt: 3001,
    rootThreshold: 0.97,
    heightSalt: 3007,
  },
  engine: ENGINE_WORLDGEN_PROFILE,
};

/** Reports whether untrusted save data has a complete, integer versioned generation identity. */
export function isWorldGenerationIdentity(value: unknown): value is WorldGenerationIdentity {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<WorldGenerationIdentity>;
  return (
    typeof candidate.profileId === "string" &&
    candidate.profileId.length > 0 &&
    typeof candidate.generatorVersion === "number" &&
    Number.isInteger(candidate.generatorVersion) &&
    candidate.generatorVersion > 0 &&
    typeof candidate.contentRegistryVersion === "number" &&
    Number.isInteger(candidate.contentRegistryVersion) &&
    candidate.contentRegistryVersion > 0
  );
}

/** Compares every compatibility field rather than assuming a matching profile name is sufficient. */
export function identitiesMatch(
  left: WorldGenerationIdentity,
  right: WorldGenerationIdentity,
): boolean {
  return (
    left.profileId === right.profileId &&
    left.generatorVersion === right.generatorVersion &&
    left.contentRegistryVersion === right.contentRegistryVersion
  );
}

/** Resolves a persisted identity and rejects worlds whose generator is unavailable in this release. */
export function resolveWorldProfile(identity: WorldGenerationIdentity): WorldProfile {
  if (identitiesMatch(identity, LEGACY_WORLD_IDENTITY)) {
    return LEGACY_WORLD_PROFILE;
  }
  if (identitiesMatch(identity, ENGINE_WORLD_IDENTITY)) {
    return ENGINE_WORLD_PROFILE;
  }
  throw new Error(
    `This build does not support world profile ${identity.profileId} ` +
    `at generator version ${identity.generatorVersion}.`,
  );
}

/** Validates structural profile invariants before chunk allocation or generation begins. */
export function validateWorldProfile(profile: WorldProfile): void {
  const { chunkSize, sectionHeight, worldHeight } = profile.dimensions;
  if (
    !Number.isInteger(chunkSize) ||
    !Number.isInteger(sectionHeight) ||
    !Number.isInteger(worldHeight) ||
    chunkSize <= 0 ||
    sectionHeight <= 0 ||
    worldHeight <= 0 ||
    worldHeight % sectionHeight !== 0
  ) {
    throw new Error("World dimensions must be positive integers with evenly divisible vertical sections.");
  }

  // Streaming and terrain bounds must fit the validated dimensions before loops consume them.
  const terrain = profile.terrain;
  if (
    !Number.isInteger(profile.renderDistance) ||
    profile.renderDistance < 0 ||
    !Number.isInteger(terrain.baseHeight) ||
    !Number.isInteger(terrain.minimumHeight) ||
    !Number.isInteger(terrain.topMargin) ||
    !Number.isInteger(terrain.bedrockMaximumHeight) ||
    !Number.isInteger(terrain.deepslateMaximumHeight) ||
    terrain.minimumHeight < 0 ||
    terrain.topMargin <= 0 ||
    terrain.minimumHeight >= worldHeight - terrain.topMargin ||
    terrain.baseHeight < terrain.minimumHeight ||
    terrain.baseHeight >= worldHeight - terrain.topMargin ||
    terrain.bedrockMaximumHeight < 0 ||
    terrain.deepslateMaximumHeight < terrain.bedrockMaximumHeight ||
    terrain.deepslateMaximumHeight >= worldHeight
  ) {
    throw new Error("World terrain and streaming values are incompatible with the profile dimensions.");
  }

  // Tree bounds and salts are generation inputs, so invalid values must fail before sampling begins.
  const trees = profile.trees;
  if (
    !Number.isInteger(trees.minimumSurfaceOffset) ||
    !Number.isInteger(trees.canopyRadius) ||
    !Number.isInteger(trees.minimumTrunkHeight) ||
    !Number.isInteger(trees.trunkHeightRange) ||
    !Number.isInteger(trees.rootSalt) ||
    !Number.isInteger(trees.heightSalt) ||
    trees.canopyRadius < 0 ||
    trees.minimumTrunkHeight <= 0 ||
    trees.trunkHeightRange <= 0 ||
    !Number.isFinite(trees.rootThreshold) ||
    trees.rootThreshold < 0 ||
    trees.rootThreshold > 1
  ) {
    throw new Error("World tree values must be finite, bounded, and compatible with deterministic generation.");
  }
  if (
    profile.engine !== undefined &&
    (
      profile.engine.seaLevel >= worldHeight
      || profile.engine.caves.maximumY >= worldHeight
      || profile.engine.terrain.baseHeight !== terrain.baseHeight
      || profile.engine.terrain.minimumHeight !== terrain.minimumHeight
      || profile.engine.terrain.topMargin !== terrain.topMargin
      || profile.engine.bedrock.maximumHeight !== terrain.bedrockMaximumHeight
    )
  ) {
    throw new Error("Engine generation bounds must fit and match the owning world profile.");
  }
}
