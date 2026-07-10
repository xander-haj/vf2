/**
 * Defines the validated runtime contract consumed by engine-v2 world generation.
 * Generated content registries can implement these structural interfaces without importing runtime classes.
 */

import type { BlockId } from "../../game/block-types";
import { SeedStreamFactory } from "./seed-stream";

/** Numeric interval used by climate and height eligibility checks. */
export interface NumericRange {
  readonly minimum: number;
  readonly maximum: number;
}

/** ClimateSample contains every broad field used for terrain and biome classification. */
export interface ClimateSample {
  readonly continentalness: number;
  readonly erosion: number;
  readonly temperature: number;
  readonly humidity: number;
  readonly weirdness: number;
}

/** EngineBiomeDefinition describes one complete terrain and surface material regime. */
export interface EngineBiomeDefinition {
  readonly id: string;
  readonly temperature: NumericRange;
  readonly humidity: NumericRange;
  readonly continentalness: NumericRange;
  readonly elevationBias: number;
  readonly elevationScale: number;
  readonly topBlock: BlockId;
  readonly fillerBlock: BlockId;
  readonly fillerDepth: number;
  readonly shoreBlock: BlockId;
  readonly underwaterBlock: BlockId;
  readonly tags: readonly string[];
}

/** OreShape selects a placement algorithm with shape-specific geometry. */
export type OreShape = "scatter" | "blob" | "sheet" | "stratum" | "vein";

/** OreFeatureDefinition configures deterministic replacement of underground base blocks. */
export interface OreFeatureDefinition {
  readonly id: string;
  readonly salt: number;
  readonly block: BlockId;
  readonly deepBlock: BlockId;
  readonly shape: OreShape;
  readonly distribution: "uniform" | "triangular" | "gaussian" | "noise-gated" | "fixed-grid";
  readonly minimumY: number;
  readonly maximumY: number;
  readonly attemptsPerChunk: number;
  readonly chance: number;
  readonly size: number;
  readonly radius: number;
  readonly exposure: "allow" | "discard";
  readonly biomeTags: readonly string[];
}

/** DecorationDefinition places a bounded block cluster on a compatible exposed surface. */
export interface DecorationDefinition {
  readonly id: string;
  readonly salt: number;
  readonly kind: "tree" | "boulder" | "column";
  readonly attemptsPerChunk: number;
  readonly chance: number;
  readonly biomeTags: readonly string[];
  readonly block: BlockId;
  readonly secondaryBlock: BlockId;
  readonly minimumHeight: number;
  readonly heightRange: number;
  readonly radius: number;
}

/** StructureDefinition controls grid-separated procedural structures without external templates. */
export interface StructureDefinition {
  readonly id: string;
  readonly salt: number;
  readonly kind: "ruin" | "well" | "template";
  readonly spacing: number;
  readonly separation: number;
  readonly chance: number;
  readonly biomeTags: readonly string[];
  readonly foundationBlock: BlockId;
  readonly wallBlock: BlockId;
  readonly accentBlock: BlockId;
  readonly template?: readonly StructureBlockOperation[];
}

/** StructureBlockOperation is either one template voxel or an inclusive rectangular fill. */
export interface StructureBlockOperation {
  readonly block: BlockId;
  readonly offset?: readonly [number, number, number];
  readonly fill?: {
    readonly from: readonly [number, number, number];
    readonly to: readonly [number, number, number];
  };
}

/** EngineWorldgenProfile contains every parameter that affects engine-v2 untouched blocks. */
export interface EngineWorldgenProfile {
  readonly dimensionId: string;
  readonly streams: Readonly<{
    climate: number;
    terrain: number;
    caves: number;
    aquifers: number;
    surface: number;
    geology: number;
    structures: number;
    features: number;
    spawning: number;
  }>;
  readonly seaLevel: number;
  readonly lavaLevel: number;
  readonly terrain: {
    readonly baseHeight: number;
    readonly minimumHeight: number;
    readonly topMargin: number;
    readonly continentScale: number;
    readonly erosionScale: number;
    readonly ridgeScale: number;
    readonly detailScale: number;
    readonly densityScale: number;
    readonly overhangStrength: number;
    readonly verticalGradient: number;
  };
  readonly bedrock: {
    readonly maximumHeight: number;
    readonly block: BlockId;
  };
  readonly climate: {
    readonly temperatureScale: number;
    readonly humidityScale: number;
    readonly weirdnessScale: number;
    readonly octaves: number;
  };
  readonly caves: {
    readonly minimumY: number;
    readonly maximumY: number;
    readonly surfaceClearance: number;
    readonly cheeseScale: number;
    readonly cheeseThreshold: number;
    readonly tunnelScale: number;
    readonly tunnelThreshold: number;
  };
  readonly aquifers: {
    readonly enabled: boolean;
    readonly waterTableVariation: number;
    readonly pressureScale: number;
    readonly lavaChance: number;
  };
  readonly biomes: readonly EngineBiomeDefinition[];
  readonly ores: readonly OreFeatureDefinition[];
  readonly decorations: readonly DecorationDefinition[];
  readonly structures: readonly StructureDefinition[];
}

/** GenerationContext exposes one immutable seed/profile pair to every ordered generation pass. */
export class GenerationContext {
  public readonly streams: SeedStreamFactory;

  public constructor(
    public readonly seed: number,
    public readonly profile: EngineWorldgenProfile,
  ) {
    validateEngineWorldgenProfile(profile);
    this.streams = new SeedStreamFactory(seed, profile.dimensionId, profile.streams);
  }
}

/** Rejects invalid generated registry data before it can allocate or loop over generation ranges. */
export function validateEngineWorldgenProfile(profile: EngineWorldgenProfile): void {
  if (profile.dimensionId.length === 0) throw new Error("World-generation dimensionId cannot be empty.");
  const streamNames = [
    "climate", "terrain", "caves", "aquifers", "surface", "geology",
    "structures", "features", "spawning",
  ] as const;
  if (
    Object.keys(profile.streams).length !== streamNames.length
    || !streamNames.every((name) => Number.isSafeInteger(profile.streams[name]))
  ) {
    throw new Error("Every world-generation stream must define one safe integer salt.");
  }
  const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;
  const terrainScales = [
    profile.terrain.continentScale,
    profile.terrain.erosionScale,
    profile.terrain.ridgeScale,
    profile.terrain.detailScale,
    profile.terrain.densityScale,
    profile.climate.temperatureScale,
    profile.climate.humidityScale,
    profile.climate.weirdnessScale,
  ];
  if (
    !terrainScales.every(finitePositive) ||
    !Number.isInteger(profile.terrain.baseHeight) ||
    !Number.isInteger(profile.terrain.minimumHeight) ||
    !Number.isInteger(profile.terrain.topMargin) ||
    profile.terrain.minimumHeight < 1 ||
    profile.terrain.topMargin < 1 ||
    profile.terrain.baseHeight < profile.terrain.minimumHeight ||
    !Number.isFinite(profile.terrain.overhangStrength) ||
    !finitePositive(profile.terrain.verticalGradient) ||
    !Number.isInteger(profile.climate.octaves) ||
    profile.climate.octaves < 1 ||
    profile.climate.octaves > 8
  ) {
    throw new Error("Terrain scales must be positive and overhang strength must be finite.");
  }
  if (!Number.isInteger(profile.bedrock.maximumHeight) || profile.bedrock.maximumHeight < 0) {
    throw new Error("Bedrock maximumHeight must be a non-negative integer.");
  }
  if (
    !Number.isInteger(profile.seaLevel) ||
    !Number.isInteger(profile.lavaLevel) ||
    profile.lavaLevel < 0 ||
    profile.lavaLevel >= profile.seaLevel
  ) {
    throw new Error("Sea and lava levels must be integers with lava below sea level.");
  }
  if (
    !Number.isInteger(profile.caves.minimumY) ||
    !Number.isInteger(profile.caves.maximumY) ||
    !Number.isInteger(profile.caves.surfaceClearance) ||
    profile.caves.minimumY < 1 ||
    profile.caves.maximumY < profile.caves.minimumY ||
    profile.caves.surfaceClearance < 1 ||
    !finitePositive(profile.caves.cheeseScale) ||
    !finitePositive(profile.caves.tunnelScale) ||
    !Number.isFinite(profile.caves.cheeseThreshold) ||
    !Number.isFinite(profile.caves.tunnelThreshold) ||
    profile.caves.cheeseThreshold < -1 ||
    profile.caves.cheeseThreshold > 1 ||
    profile.caves.tunnelThreshold < 0 ||
    profile.caves.tunnelThreshold > 1
  ) {
    throw new Error("Cave ranges, scales, and thresholds are invalid.");
  }
  if (
    profile.aquifers.waterTableVariation < 0 ||
    !finitePositive(profile.aquifers.pressureScale) ||
    profile.aquifers.lavaChance < 0 ||
    profile.aquifers.lavaChance > 1
  ) {
    throw new Error("Aquifer variation, pressure scale, and lava chance are invalid.");
  }
  const ids = new Set<string>();
  for (const biome of profile.biomes) {
    requireUniqueId(ids, biome.id);
    validateRange(biome.temperature, `${biome.id} temperature`);
    validateRange(biome.humidity, `${biome.id} humidity`);
    validateRange(biome.continentalness, `${biome.id} continentalness`);
    if (!Number.isInteger(biome.fillerDepth) || biome.fillerDepth < 0) {
      throw new Error(`Biome ${biome.id} fillerDepth must be a non-negative integer.`);
    }
  }
  if (profile.biomes.length === 0) throw new Error("At least one engine biome is required.");
  for (const ore of profile.ores) {
    requireUniqueId(ids, ore.id);
    if (
      !Number.isSafeInteger(ore.salt) ||
      !Number.isInteger(ore.minimumY) ||
      !Number.isInteger(ore.maximumY) ||
      ore.minimumY < 1 ||
      ore.maximumY < ore.minimumY ||
      !Number.isInteger(ore.attemptsPerChunk) ||
      ore.attemptsPerChunk < 0 ||
      ore.attemptsPerChunk > 64 ||
      ore.chance < 0 ||
      ore.chance > 1 ||
      !Number.isInteger(ore.size) ||
      ore.size < 1 ||
      ore.size > 64 ||
      !Number.isInteger(ore.radius) ||
      ore.radius < 1 ||
      ore.radius > 32
    ) {
      throw new Error(`Ore ${ore.id} has invalid height, attempt, chance, size, or radius controls.`);
    }
  }
  for (const decoration of profile.decorations) {
    requireUniqueId(ids, decoration.id);
    if (
      !Number.isSafeInteger(decoration.salt) ||
      !Number.isInteger(decoration.attemptsPerChunk) ||
      decoration.attemptsPerChunk < 0 ||
      decoration.attemptsPerChunk > 64 ||
      decoration.chance < 0 ||
      decoration.chance > 1 ||
      !Number.isInteger(decoration.minimumHeight) ||
      !Number.isInteger(decoration.heightRange) ||
      !Number.isInteger(decoration.radius) ||
      decoration.minimumHeight < 1 ||
      decoration.heightRange < 1 ||
      decoration.radius < 0 ||
      decoration.radius > 8
    ) {
      throw new Error(`Decoration ${decoration.id} has invalid placement or dimension controls.`);
    }
  }
  for (const structure of profile.structures) {
    requireUniqueId(ids, structure.id);
    if (
      !Number.isSafeInteger(structure.salt) ||
      !Number.isInteger(structure.spacing) ||
      !Number.isInteger(structure.separation) ||
      structure.spacing < 16 ||
      structure.separation < 4 ||
      structure.separation * 2 >= structure.spacing ||
      structure.chance < 0 ||
      structure.chance > 1
    ) {
      throw new Error(`Structure ${structure.id} has invalid spacing, separation, or chance.`);
    }
    if (structure.kind === "template") validateStructureTemplate(structure);
  }
}

/** Validates that each inline structure template operation has exactly one safe bounded geometry source. */
function validateStructureTemplate(structure: StructureDefinition): void {
  if (structure.template === undefined || structure.template.length === 0 || structure.template.length > 256) {
    throw new Error(`Template structure ${structure.id} must contain between 1 and 256 operations.`);
  }
  for (const operation of structure.template) {
    if ((operation.offset === undefined) === (operation.fill === undefined)) {
      throw new Error(`Structure ${structure.id} operations require exactly one offset or fill.`);
    }
    const points = operation.offset === undefined
      ? [...operation.fill!.from, ...operation.fill!.to]
      : [...operation.offset];
    if (!points.every((value) => Number.isInteger(value) && Math.abs(value) <= 32)) {
      throw new Error(`Structure ${structure.id} operation coordinates must be bounded integers.`);
    }
    if (operation.fill !== undefined) {
      const { from, to } = operation.fill;
      if (from.some((value, index) => value > (to[index] ?? value))) {
        throw new Error(`Structure ${structure.id} fill bounds must ascend on every axis.`);
      }
    }
  }
}

/** Validates an inclusive finite interval. */
function validateRange(range: NumericRange, label: string): void {
  if (!Number.isFinite(range.minimum) || !Number.isFinite(range.maximum) || range.minimum > range.maximum) {
    throw new Error(`${label} must be a finite ascending range.`);
  }
}

/** Enforces namespaced, globally unique IDs within one world-generation profile. */
function requireUniqueId(ids: Set<string>, id: string): void {
  if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id)) throw new Error(`Invalid namespaced ID: ${id}`);
  if (ids.has(id)) throw new Error(`Duplicate world-generation ID: ${id}`);
  ids.add(id);
}
