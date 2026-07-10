/** Compiles the unsaved canonical engine-v2 snapshot into the exact production generator contract. */

// Generated block identities and production worldgen interfaces define the adapter's compatibility boundary.
import { BLOCK_ID_BY_CONTENT_ID, type BlockId } from "../generated/block-registry";
import { ENGINE_WORLDGEN_PROFILE } from "../generated/engine-worldgen-registry";
import type {
  DecorationDefinition,
  EngineBiomeDefinition,
  EngineWorldgenProfile,
  OreFeatureDefinition,
  StructureDefinition,
  StructureBlockOperation,
} from "../engine/worldgen/generation-context";
import type { WorldDimensions } from "../world/world-profile";
import type { JsonObject, JsonValue } from "./editor-state";

export interface EditorWorldgenSnapshot {
  readonly profile: EngineWorldgenProfile;
  readonly dimensions: WorldDimensions;
}

/** Rejects incomplete unsaved values before they can reach hot generation loops. */
function object(value: JsonValue | undefined, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

/** Reads one finite authored number and reports the exact missing field. */
function number(source: JsonObject, key: string, label = key): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

/** Reads one non-empty authored identifier or enum value. */
function string(source: JsonObject, key: string, label = key): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

/** Reads an array of canonical objects without permitting partial entries. */
function objects(source: JsonObject, key: string): JsonObject[] {
  const value = source[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array.`);
  return value.map((entry, index) => object(entry, `${key}[${index}]`));
}

/** Resolves a canonical block reference to its append-only runtime byte identifier. */
function block(source: JsonObject, key: string): BlockId {
  const identifier = string(source, key);
  const blockId = BLOCK_ID_BY_CONTENT_ID.get(identifier);
  if (blockId === undefined) throw new Error(`${key} references unknown block ${identifier}.`);
  return blockId;
}

/** Converts a two-number canonical interval to the generator's named range contract. */
function range(source: JsonObject, key: string): { minimum: number; maximum: number } {
  const value = source[key];
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" ||
      typeof value[1] !== "number") throw new Error(`${key} must contain two numbers.`);
  return { minimum: value[0], maximum: value[1] };
}

/** Reads string tags and conditions while rejecting mixed arrays. */
function strings(source: JsonObject, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${key} must contain only strings.`);
  }
  return value as string[];
}

/** Converts one template coordinate into its exact three-number tuple contract. */
function tuple(value: JsonValue | undefined, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => typeof component !== "number")) {
    throw new Error(`${label} must contain three numbers.`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

/** Finds one canonical file by its stable project-relative suffix. */
function file(files: Readonly<Record<string, JsonValue>>, suffix: string): JsonObject {
  const entry = Object.entries(files).find(([path]) => path.endsWith(suffix));
  if (entry === undefined) throw new Error(`Editor snapshot is missing ${suffix}.`);
  return object(entry[1], suffix);
}

/** Compiles canonical biome surface and climate fields exactly as the generated registry does. */
function compileBiomes(source: JsonObject): EngineBiomeDefinition[] {
  return objects(source, "biomes").map((biome) => ({
    id: string(biome, "id"),
    temperature: range(biome, "temperature"),
    humidity: range(biome, "humidity"),
    continentalness: range(biome, "continentalness"),
    elevationBias: number(biome, "elevationBias"),
    elevationScale: number(biome, "elevationScale"),
    topBlock: block(biome, "topBlockId"),
    fillerBlock: block(biome, "fillerBlockId"),
    fillerDepth: number(biome, "fillerDepth"),
    shoreBlock: block(biome, "shoreBlockId"),
    underwaterBlock: block(biome, "underwaterBlockId"),
    tags: strings(biome, "tags"),
  }));
}

/** Compiles every shape-specific ore field consumed by FeaturePlacer. */
function compileOres(source: JsonObject): OreFeatureDefinition[] {
  const validShapes = new Set(["scatter", "blob", "sheet", "stratum", "vein"]);
  const validDistributions = new Set(["uniform", "triangular", "gaussian", "noise-gated", "fixed-grid"]);
  return objects(source, "ores").map((ore) => {
    const shape = string(ore, "shape");
    const distribution = string(ore, "distribution");
    if (!validShapes.has(shape) || !validDistributions.has(distribution)) {
      throw new Error(`Ore ${string(ore, "id")} has an unsupported shape or distribution.`);
    }
    const exposure = string(ore, "exposure");
    if (exposure !== "allow" && exposure !== "discard") throw new Error("Ore exposure must be allow or discard.");
    return {
      id: string(ore, "id"),
      salt: number(ore, "salt"),
      block: block(ore, "blockId"),
      deepBlock: block(ore, "deepBlockId"),
      shape: shape as OreFeatureDefinition["shape"],
      distribution: distribution as OreFeatureDefinition["distribution"],
      minimumY: number(ore, "minimumY"), maximumY: number(ore, "maximumY"),
      attemptsPerChunk: number(ore, "attemptsPerChunk"), chance: number(ore, "chance"),
      size: number(ore, "size"), radius: number(ore, "radius"), exposure,
      biomeTags: strings(ore, "biomeTags"),
    };
  });
}

/** Compiles bounded tree, boulder, and column placement definitions. */
function compileDecorations(source: JsonObject): DecorationDefinition[] {
  return objects(source, "decorations").map((feature) => {
    const kind = string(feature, "kind");
    if (kind !== "tree" && kind !== "boulder" && kind !== "column") {
      throw new Error(`Decoration ${string(feature, "id")} has an unsupported kind.`);
    }
    return {
      id: string(feature, "id"), kind, attemptsPerChunk: number(feature, "attemptsPerChunk"),
      salt: number(feature, "salt"),
      chance: number(feature, "chance"), biomeTags: strings(feature, "biomeTags"),
      block: block(feature, "blockId"), secondaryBlock: block(feature, "secondaryBlockId"),
      minimumHeight: number(feature, "minimumHeight"), heightRange: number(feature, "heightRange"),
      radius: number(feature, "radius"),
    };
  });
}

/** Compiles region placement and material references for production structure placement. */
function compileStructures(source: JsonObject): StructureDefinition[] {
  return objects(source, "structures").map((structure) => {
    const kind = string(structure, "kind");
    if (kind !== "well" && kind !== "ruin" && kind !== "template") {
      throw new Error(`Structure ${string(structure, "id")} has an unsupported kind.`);
    }
    const templateValue = structure.template;
    const template = Array.isArray(templateValue) ? templateValue.map((entry, index): StructureBlockOperation => {
      const operation = object(entry, `template[${index}]`);
      const fill = operation.fill === undefined ? undefined : object(operation.fill, `template[${index}].fill`);
      return {
        block: block(operation, "blockId"),
        ...(operation.offset === undefined ? {} : { offset: tuple(operation.offset, "offset") }),
        ...(fill === undefined ? {} : {
          fill: { from: tuple(fill.from, "fill.from"), to: tuple(fill.to, "fill.to") },
        }),
      };
    }) : undefined;
    return {
      id: string(structure, "id"), kind, spacing: number(structure, "spacing"),
      salt: number(structure, "salt"),
      separation: number(structure, "separation"), chance: number(structure, "chance"),
      biomeTags: strings(structure, "biomeTags"), foundationBlock: block(structure, "foundationBlockId"),
      wallBlock: block(structure, "wallBlockId"), accentBlock: block(structure, "accentBlockId"),
      ...(template === undefined ? {} : { template }),
    };
  });
}

/** Produces the exact EngineWorldGenerator input from the complete unsaved canonical snapshot. */
export function compileEditorWorldgen(files: Readonly<Record<string, JsonValue>>): EditorWorldgenSnapshot {
  const source = file(files, "worldgen/profiles/engine-v2.json");
  const dimensions = object(source.dimensions, "dimensions");
  const climate = object(source.climate, "climate");
  const terrain = object(source.terrain, "terrain");
  const bedrock = object(source.bedrock, "bedrock");
  const caves = object(source.caves, "caves");
  const aquifers = object(source.aquifers, "aquifers");
  const streams = object(source.streams, "streams");
  const features = file(files, "worldgen/features/engine-features.json");
  const profile: EngineWorldgenProfile = {
    ...structuredClone(ENGINE_WORLDGEN_PROFILE),
    dimensionId: string(source, "id"), seaLevel: number(source, "seaLevel"),
    lavaLevel: number(source, "lavaLevel"),
    streams: {
      climate: number(streams, "climate"), terrain: number(streams, "terrain"),
      caves: number(streams, "caves"), aquifers: number(streams, "aquifers"),
      surface: number(streams, "surface"), geology: number(streams, "geology"),
      structures: number(streams, "structures"), features: number(streams, "features"),
      spawning: number(streams, "spawning"),
    },
    terrain: {
      baseHeight: number(terrain, "baseHeight"), minimumHeight: number(terrain, "minimumHeight"),
      topMargin: number(terrain, "topMargin"),
      continentScale: number(terrain, "continentScale"), erosionScale: number(terrain, "erosionScale"),
      ridgeScale: number(terrain, "ridgeScale"), detailScale: number(terrain, "detailScale"),
      densityScale: number(terrain, "densityScale"), overhangStrength: number(terrain, "overhangStrength"),
      verticalGradient: number(terrain, "verticalGradient"),
    },
    bedrock: { maximumHeight: number(bedrock, "maximumHeight"), block: block(bedrock, "blockId") },
    climate: {
      temperatureScale: number(climate, "temperatureScale"),
      humidityScale: number(climate, "humidityScale"), weirdnessScale: number(climate, "weirdnessScale"),
      octaves: number(climate, "octaves"),
    },
    caves: {
      minimumY: number(caves, "minimumY"), maximumY: number(caves, "maximumY"),
      surfaceClearance: number(caves, "surfaceClearance"), cheeseScale: number(caves, "cheeseScale"),
      cheeseThreshold: number(caves, "cheeseThreshold"), tunnelScale: number(caves, "tunnelScale"),
      tunnelThreshold: number(caves, "tunnelThreshold"),
    },
    aquifers: {
      enabled: aquifers.enabled === true,
      waterTableVariation: number(aquifers, "waterTableVariation"),
      pressureScale: number(aquifers, "pressureScale"), lavaChance: number(aquifers, "lavaChance"),
    },
    biomes: compileBiomes(file(files, "worldgen/biomes/engine-biomes.json")),
    ores: compileOres(features), decorations: compileDecorations(features),
    structures: compileStructures(file(files, "worldgen/structures/engine-structures.json")),
  };
  return {
    profile,
    dimensions: {
      chunkSize: number(dimensions, "chunkSize"), worldHeight: number(dimensions, "worldHeight"),
      sectionHeight: number(dimensions, "sectionHeight"),
    },
  };
}
