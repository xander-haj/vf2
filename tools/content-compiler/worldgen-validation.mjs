/**
 * Validates both frozen legacy generation content and the complete engine-v2 ordered-pipeline configuration.
 * Every generator reference and loop bound is rejected before runtime generation can consume it.
 */

import {
  NAMESPACED_ID_PATTERN,
  requireArray,
  requireBoolean,
  requireChoice,
  requireInteger,
  requireNumber,
  requireObject,
  requireRange,
  requireReference,
  requireString,
  requireUniqueId,
  validateSchema,
} from "./common-validation.mjs";

const PROFILE_FILES = ["content/worldgen/profiles/legacy-v1.json", "content/worldgen/profiles/engine-v2.json"];

const FROZEN_LEGACY_PROFILE = {
  dimensions: { chunkSize: 16, worldHeight: 64, sectionHeight: 16 },
  renderDistance: 2,
  terrain: { baseHeight: 25, minimumHeight: 4, topMargin: 9, bedrockMaximumHeight: 2,
    deepslateMaximumHeight: 14, continentalScale: 72, continentalOctaves: 4, continentalAmplitude: 12,
    detailScale: 24, detailOctaves: 3, detailAmplitude: 4 },
  trees: { minimumSurfaceOffset: -1, canopyRadius: 2, minimumTrunkHeight: 4, trunkHeightRange: 2,
    rootSalt: 503, rootThreshold: 0.982, heightSalt: 887 },
};

/** Validates version identities, dimensions, engine passes, biomes, features, and structures. */
export function validateWorldgen(documents, indexes, collector) {
  const profileIds = new Set();
  const profiles = [];
  for (const file of PROFILE_FILES) {
    const profile = validateSchema(documents.get(file), collector, file);
    const id = requireString(profile?.id, collector, file, "$.id", NAMESPACED_ID_PATTERN);
    requireUniqueId(id, profileIds, collector, file, "$.id", "world profile");
    requireInteger(profile?.generatorVersion, collector, file, "$.generatorVersion", 1);
    requireInteger(profile?.contentRegistryVersion, collector, file, "$.contentRegistryVersion", 1);
    const dimensions = requireObject(profile?.dimensions, collector, file, "$.dimensions");
    const height = requireInteger(dimensions?.worldHeight, collector, file, "$.dimensions.worldHeight", 16, 512);
    const section = requireInteger(dimensions?.sectionHeight, collector, file, "$.dimensions.sectionHeight", 4, 64);
    requireInteger(dimensions?.chunkSize, collector, file, "$.dimensions.chunkSize", 8, 64);
    if (height !== null && section !== null && height % section !== 0) collector.add(file, "$.dimensions",
      "invalid-sections", "World height must divide evenly into section height.");
    requireInteger(profile?.renderDistance, collector, file, "$.renderDistance", 1, 16);
    if (file.endsWith("legacy-v1.json") && (profile?.id !== "vf:legacy_v1" ||
      profile?.generatorVersion !== 1 || profile?.contentRegistryVersion !== 1)) {
      collector.add(file, "$", "legacy-version-changed", "Legacy profile identity and versions are frozen at 1.");
    }
    if (file.endsWith("legacy-v1.json") &&
      (profile?.biomeSetId !== "vf:legacy_biomes" || profile?.featureSetId !== "vf:legacy_features")) {
      collector.add(file, "$", "legacy-set-changed", "Legacy biome and feature set references are frozen.");
    }
    if (file.endsWith("legacy-v1.json")) validateFrozenValues(profile, FROZEN_LEGACY_PROFILE, collector, file, "$");
    if (file.endsWith("engine-v2.json") && (profile?.id !== "vf:engine_v2" ||
      profile?.generatorVersion !== 2 || profile?.contentRegistryVersion !== 2)) {
      collector.add(file, "$", "engine-version-mismatch", "Engine profile identity and versions must remain 2.");
    }
    if (file.endsWith("engine-v2.json") && (profile?.biomeSetId !== "vf:engine_biomes" ||
      profile?.featureSetId !== "vf:engine_features" || profile?.structureSetId !== "vf:engine_structures")) {
      collector.add(file, "$", "engine-set-mismatch", "Engine profile must reference the compiled engine sets.");
    }
    profiles.push(profile);
  }
  validateLegacyWorldgen(documents, indexes.blockIds, collector);
  const biomeIds = validateEngineWorldgen(documents, indexes.blockIds, indexes.blocks, collector);
  return { profiles, biomeIds };
}

/** Recursively enforces values that participate in the frozen vf:legacy_v1 generator identity. */
function validateFrozenValues(actual, expected, collector, file, path) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const nextPath = `${path}.${key}`;
    if (expectedValue !== null && typeof expectedValue === "object") {
      validateFrozenValues(actual?.[key], expectedValue, collector, file, nextPath);
    } else if (actual?.[key] !== expectedValue) {
      collector.add(file, nextPath, "legacy-value-changed",
        `Frozen legacy value must remain ${String(expectedValue)}.`);
    }
  }
}

/** Confirms frozen legacy content references while executable compatibility remains in handwritten code. */
function validateLegacyWorldgen(documents, blockIds, collector) {
  const biomeFile = "content/worldgen/biomes/legacy-biomes.json";
  const biomes = validateSchema(documents.get(biomeFile), collector, biomeFile);
  const biomeIds = new Set();
  const bandIds = new Set();
  requireArray(biomes?.bands, collector, biomeFile, "$.bands").forEach((value, index) => {
    const path = `$.bands[${index}]`;
    const band = requireObject(value, collector, biomeFile, path);
    if (band === null) return;
    const id = requireString(band.id, collector, biomeFile, `${path}.id`, NAMESPACED_ID_PATTERN);
    requireUniqueId(id, bandIds, collector, biomeFile, `${path}.id`, "surface band");
    requireArray(band.blocks, collector, biomeFile, `${path}.blocks`).forEach((blockId, blockIndex) =>
      requireReference(blockId, blockIds, collector, biomeFile, `${path}.blocks[${blockIndex}]`, "block"));
  });
  requireArray(biomes?.biomes, collector, biomeFile, "$.biomes").forEach((value, index) => {
    const path = `$.biomes[${index}]`;
    const biome = requireObject(value, collector, biomeFile, path);
    if (biome === null) return;
    const id = requireString(biome.id, collector, biomeFile, `${path}.id`, NAMESPACED_ID_PATTERN);
    requireUniqueId(id, biomeIds, collector, biomeFile, `${path}.id`, "legacy biome");
    requireArray(biome.surface, collector, biomeFile, `${path}.surface`).forEach((layer, layerIndex) => {
      const layerPath = `${path}.surface[${layerIndex}]`;
      const object = requireObject(layer, collector, biomeFile, layerPath);
      if (object?.blockId !== undefined) requireReference(object.blockId, blockIds, collector, biomeFile,
        `${layerPath}.blockId`, "block");
      if (object?.bandId !== undefined) requireReference(object.bandId, bandIds, collector, biomeFile,
        `${layerPath}.bandId`, "surface band");
    });
  });
  requireArray(biomes?.classificationOrder, collector, biomeFile, "$.classificationOrder")
    .forEach((biomeId, index) => requireReference(biomeId, biomeIds, collector, biomeFile,
      `$.classificationOrder[${index}]`, "legacy biome"));
  const featureFile = "content/worldgen/features/legacy-features.json";
  const features = validateSchema(documents.get(featureFile), collector, featureFile);
  requireArray(features?.features, collector, featureFile, "$.features").forEach((value, index) => {
    const path = `$.features[${index}]`;
    const feature = requireObject(value, collector, featureFile, path);
    if (feature === null) return;
    requireString(feature.id, collector, featureFile, `${path}.id`, NAMESPACED_ID_PATTERN);
    requireReference(feature.blockId, blockIds, collector, featureFile, `${path}.blockId`, "block");
    if (feature.depthBlockId !== undefined) requireReference(feature.depthBlockId, blockIds, collector,
      featureFile, `${path}.depthBlockId`, "block");
  });
}

/** Validates every engine-v2 parameter that controls allocation, sampling, or bounded placement. */
function validateEngineWorldgen(documents, blockIds, blocks, collector) {
  const profileFile = "content/worldgen/profiles/engine-v2.json";
  const profile = documents.get(profileFile);
  const streams = requireObject(profile?.streams, collector, profileFile, "$.streams");
  const streamSalts = new Set();
  const streamNames = ["climate", "terrain", "caves", "aquifers", "surface", "geology", "structures",
    "features", "spawning"];
  if (streams !== null && Object.keys(streams).some((key) => !streamNames.includes(key))) {
    collector.add(profileFile, "$.streams", "unknown-stream", "World profile contains an unsupported stream name.");
  }
  for (const key of streamNames) {
    const salt = requireInteger(streams?.[key], collector, profileFile, `$.streams.${key}`, 1,
      Number.MAX_SAFE_INTEGER);
    requireUniqueId(salt, streamSalts, collector, profileFile, `$.streams.${key}`, "stream salt");
  }
  const seaLevel = requireInteger(profile?.seaLevel, collector, profileFile, "$.seaLevel", 1, 511);
  const lavaLevel = requireInteger(profile?.lavaLevel, collector, profileFile, "$.lavaLevel", 0, 510);
  if (seaLevel !== null && lavaLevel !== null && lavaLevel >= seaLevel) collector.add(profileFile, "$.lavaLevel",
    "invalid-fluid-level", "Lava level must remain below sea level.");
  const terrain = requireObject(profile?.terrain, collector, profileFile, "$.terrain");
  requireInteger(terrain?.baseHeight, collector, profileFile, "$.terrain.baseHeight", 1, 510);
  requireInteger(terrain?.minimumHeight, collector, profileFile, "$.terrain.minimumHeight", 0, 509);
  requireInteger(terrain?.topMargin, collector, profileFile, "$.terrain.topMargin", 1, 128);
  for (const key of ["continentScale", "erosionScale", "ridgeScale", "detailScale", "densityScale"]) {
    requireNumber(terrain?.[key], collector, profileFile, `$.terrain.${key}`, 0.001);
  }
  requireNumber(terrain?.overhangStrength, collector, profileFile, "$.terrain.overhangStrength", 0, 2);
  requireNumber(terrain?.verticalGradient, collector, profileFile, "$.terrain.verticalGradient", 0.001, 2);
  const climate = requireObject(profile?.climate, collector, profileFile, "$.climate");
  for (const key of ["temperatureScale", "humidityScale", "weirdnessScale"]) {
    requireNumber(climate?.[key], collector, profileFile, `$.climate.${key}`, 0.001, 4096);
  }
  requireInteger(climate?.octaves, collector, profileFile, "$.climate.octaves", 1, 8);
  const worldHeight = profile?.dimensions?.worldHeight;
  if (Number.isInteger(worldHeight) && seaLevel !== null && seaLevel >= worldHeight) {
    collector.add(profileFile, "$.seaLevel", "invalid-sea-level", "Sea level must remain below world height.");
  }
  if (Number.isInteger(worldHeight) && Number.isInteger(terrain?.baseHeight) &&
    Number.isInteger(terrain?.minimumHeight) && Number.isInteger(terrain?.topMargin) &&
    (terrain.minimumHeight >= worldHeight - terrain.topMargin || terrain.baseHeight < terrain.minimumHeight ||
      terrain.baseHeight >= worldHeight - terrain.topMargin)) {
    collector.add(profileFile, "$.terrain", "invalid-terrain-bounds",
      "Terrain minimum, base height, and top margin must fit inside world height.");
  }
  const caves = requireObject(profile?.caves, collector, profileFile, "$.caves");
  requireInteger(caves?.minimumY, collector, profileFile, "$.caves.minimumY", 1);
  requireInteger(caves?.maximumY, collector, profileFile, "$.caves.maximumY", 1);
  requireNumber(caves?.cheeseThreshold, collector, profileFile, "$.caves.cheeseThreshold", -1, 1);
  requireNumber(caves?.tunnelThreshold, collector, profileFile, "$.caves.tunnelThreshold", 0, 1);
  requireInteger(caves?.surfaceClearance, collector, profileFile, "$.caves.surfaceClearance", 1, 64);
  requireNumber(caves?.cheeseScale, collector, profileFile, "$.caves.cheeseScale", 0.001, 4096);
  requireNumber(caves?.tunnelScale, collector, profileFile, "$.caves.tunnelScale", 0.001, 4096);
  if (Number.isInteger(caves?.minimumY) && Number.isInteger(caves?.maximumY) &&
    (caves.minimumY > caves.maximumY || (Number.isInteger(worldHeight) && caves.maximumY >= worldHeight))) {
    collector.add(profileFile, "$.caves", "invalid-cave-bounds", "Cave bounds must be ordered inside world height.");
  }
  const aquifers = requireObject(profile?.aquifers, collector, profileFile, "$.aquifers");
  requireBoolean(aquifers?.enabled, collector, profileFile, "$.aquifers.enabled");
  requireNumber(aquifers?.lavaChance, collector, profileFile, "$.aquifers.lavaChance", 0, 1);
  requireNumber(aquifers?.waterTableVariation, collector, profileFile, "$.aquifers.waterTableVariation", 0, 128);
  requireNumber(aquifers?.pressureScale, collector, profileFile, "$.aquifers.pressureScale", 0.001, 4096);
  const bedrock = requireObject(profile?.bedrock, collector, profileFile, "$.bedrock");
  requireInteger(bedrock?.maximumHeight, collector, profileFile, "$.bedrock.maximumHeight", 0, 32);
  requireReference(bedrock?.blockId, blockIds, collector, profileFile, "$.bedrock.blockId", "block");
  const bedrockBlock = blocks.find((block) => block.id === bedrock?.blockId);
  if (bedrockBlock !== undefined && bedrockBlock.solid !== true) {
    collector.add(profileFile, "$.bedrock.blockId", "non-solid-bedrock", "Bedrock must reference a solid block.");
  }
  if (Number.isInteger(worldHeight) && Number.isInteger(bedrock?.maximumHeight) &&
    bedrock.maximumHeight >= worldHeight) {
    collector.add(profileFile, "$.bedrock.maximumHeight", "invalid-bedrock-height",
      "Bedrock maximum height must remain below world height.");
  }

  const biomeFile = "content/worldgen/biomes/engine-biomes.json";
  const biomeSet = validateSchema(documents.get(biomeFile), collector, biomeFile);
  const biomeIds = new Set();
  requireArray(biomeSet?.biomes, collector, biomeFile, "$.biomes").forEach((value, index) => {
    const path = `$.biomes[${index}]`;
    const biome = requireObject(value, collector, biomeFile, path);
    if (biome === null) return;
    const id = requireString(biome.id, collector, biomeFile, `${path}.id`, NAMESPACED_ID_PATTERN);
    requireUniqueId(id, biomeIds, collector, biomeFile, `${path}.id`, "engine biome");
    for (const key of ["temperature", "humidity", "continentalness"]) {
      requireRange(biome[key], collector, biomeFile, `${path}.${key}`, -1, 1);
    }
    requireNumber(biome.elevationBias, collector, biomeFile, `${path}.elevationBias`, -128, 128);
    requireNumber(biome.elevationScale, collector, biomeFile, `${path}.elevationScale`, 0.01, 8);
    for (const key of ["topBlockId", "fillerBlockId", "shoreBlockId", "underwaterBlockId"]) {
      requireReference(biome[key], blockIds, collector, biomeFile, `${path}.${key}`, "block");
    }
    requireInteger(biome.fillerDepth, collector, biomeFile, `${path}.fillerDepth`, 0, 32);
    const tags = requireArray(biome.tags, collector, biomeFile, `${path}.tags`);
    if (id !== null && !tags.includes(id)) collector.add(biomeFile, `${path}.tags`, "missing-self-tag",
      "Biome tags must include the biome's own namespaced ID.");
  });
  if (biomeIds.size === 0) collector.add(biomeFile, "$.biomes", "empty-biomes", "At least one biome is required.");
  validateEngineFeatures(documents, blockIds, collector);
  validateStructures(documents, blockIds, collector);
  return biomeIds;
}

/** Validates shape-specific ore and complete decoration controls. */
function validateEngineFeatures(documents, blockIds, collector) {
  const file = "content/worldgen/features/engine-features.json";
  const set = validateSchema(documents.get(file), collector, file);
  const ids = new Set();
  const salts = new Set();
  requireArray(set?.ores, collector, file, "$.ores").forEach((value, index) => {
    const path = `$.ores[${index}]`;
    const ore = requireObject(value, collector, file, path);
    if (ore === null) return;
    const id = requireString(ore.id, collector, file, `${path}.id`, NAMESPACED_ID_PATTERN);
    requireUniqueId(id, ids, collector, file, `${path}.id`, "engine feature");
    requireReference(ore.blockId, blockIds, collector, file, `${path}.blockId`, "block");
    requireReference(ore.deepBlockId, blockIds, collector, file, `${path}.deepBlockId`, "block");
    const salt = requireInteger(ore.salt, collector, file, `${path}.salt`, 1, Number.MAX_SAFE_INTEGER);
    requireUniqueId(salt, salts, collector, file, `${path}.salt`, "feature salt");
    requireChoice(ore.shape, ["scatter", "blob", "sheet", "stratum", "vein"], collector, file,
      `${path}.shape`);
    requireChoice(ore.distribution, ["uniform", "triangular", "gaussian", "noise-gated", "fixed-grid"],
      collector, file, `${path}.distribution`);
    requireInteger(ore.attemptsPerChunk, collector, file, `${path}.attemptsPerChunk`, 0, 64);
    const minimumY = requireInteger(ore.minimumY, collector, file, `${path}.minimumY`, 1, 511);
    const maximumY = requireInteger(ore.maximumY, collector, file, `${path}.maximumY`, 1, 511);
    if (minimumY !== null && maximumY !== null && minimumY > maximumY) collector.add(file, path,
      "invalid-height-range", "Ore minimumY cannot exceed maximumY.");
    requireNumber(ore.chance, collector, file, `${path}.chance`, 0, 1);
    requireInteger(ore.size, collector, file, `${path}.size`, 1, 64);
    requireInteger(ore.radius, collector, file, `${path}.radius`, 1, 32);
  });
  requireArray(set?.decorations, collector, file, "$.decorations").forEach((value, index) => {
    const path = `$.decorations[${index}]`;
    const item = requireObject(value, collector, file, path);
    if (item === null) return;
    const id = requireString(item.id, collector, file, `${path}.id`, NAMESPACED_ID_PATTERN);
    requireUniqueId(id, ids, collector, file, `${path}.id`, "engine feature");
    requireChoice(item.kind, ["tree", "boulder", "column"], collector, file, `${path}.kind`);
    const salt = requireInteger(item.salt, collector, file, `${path}.salt`, 1, Number.MAX_SAFE_INTEGER);
    requireUniqueId(salt, salts, collector, file, `${path}.salt`, "feature salt");
    requireReference(item.blockId, blockIds, collector, file, `${path}.blockId`, "block");
    requireReference(item.secondaryBlockId, blockIds, collector, file, `${path}.secondaryBlockId`, "block");
    requireInteger(item.attemptsPerChunk, collector, file, `${path}.attemptsPerChunk`, 0, 64);
    requireNumber(item.chance, collector, file, `${path}.chance`, 0, 1);
    requireInteger(item.minimumHeight, collector, file, `${path}.minimumHeight`, 1, 64);
    requireInteger(item.heightRange, collector, file, `${path}.heightRange`, 1, 64);
    requireInteger(item.radius, collector, file, `${path}.radius`, 0, 8);
  });
}

/** Validates separated-grid structure controls and all material references. */
function validateStructures(documents, blockIds, collector) {
  const file = "content/worldgen/structures/engine-structures.json";
  const set = validateSchema(documents.get(file), collector, file);
  const ids = new Set();
  const salts = new Set();
  requireArray(set?.structures, collector, file, "$.structures").forEach((value, index) => {
    const path = `$.structures[${index}]`;
    const item = requireObject(value, collector, file, path);
    if (item === null) return;
    const id = requireString(item.id, collector, file, `${path}.id`, NAMESPACED_ID_PATTERN);
    requireUniqueId(id, ids, collector, file, `${path}.id`, "structure");
    requireChoice(item.kind, ["ruin", "well", "template"], collector, file, `${path}.kind`);
    const salt = requireInteger(item.salt, collector, file, `${path}.salt`, 1, Number.MAX_SAFE_INTEGER);
    requireUniqueId(salt, salts, collector, file, `${path}.salt`, "structure salt");
    const spacing = requireInteger(item.spacing, collector, file, `${path}.spacing`, 16, 1024);
    const separation = requireInteger(item.separation, collector, file, `${path}.separation`, 4, 512);
    requireNumber(item.chance, collector, file, `${path}.chance`, 0, 1);
    if (spacing !== null && separation !== null && separation * 2 >= spacing) collector.add(file, path,
      "invalid-separation", "Structure separation must be less than half its spacing.");
    for (const key of ["foundationBlockId", "wallBlockId", "accentBlockId"]) {
      requireReference(item[key], blockIds, collector, file, `${path}.${key}`, "block");
    }
    if (item.kind === "template") validateTemplateOperations(item.template, blockIds, collector, file, path);
  });
}

/** Validates bounded inline template operations and their resolved block references. */
function validateTemplateOperations(value, blockIds, collector, file, parentPath) {
  const operations = requireArray(value, collector, file, `${parentPath}.template`);
  if (operations.length === 0 || operations.length > 256) collector.add(file, `${parentPath}.template`,
    "invalid-template-size", "Template structures require between 1 and 256 operations.");
  operations.forEach((value, index) => {
    const path = `${parentPath}.template[${index}]`;
    const operation = requireObject(value, collector, file, path);
    if (operation === null) return;
    requireReference(operation.blockId, blockIds, collector, file, `${path}.blockId`, "block");
    const hasOffset = operation.offset !== undefined;
    const hasFill = operation.fill !== undefined;
    if (hasOffset === hasFill) {
      collector.add(file, path, "invalid-template-operation", "Define exactly one offset or fill operation.");
      return;
    }
    if (hasOffset) validateIntegerVector(operation.offset, collector, file, `${path}.offset`);
    if (hasFill) {
      const fill = requireObject(operation.fill, collector, file, `${path}.fill`);
      if (fill !== null) {
        validateIntegerVector(fill.from, collector, file, `${path}.fill.from`);
        validateIntegerVector(fill.to, collector, file, `${path}.fill.to`);
        if (Array.isArray(fill.from) && Array.isArray(fill.to) && fill.from.length === 3 &&
          fill.to.length === 3 && fill.from.some((coordinate, axis) => coordinate > fill.to[axis])) {
          collector.add(file, `${path}.fill`, "invalid-template-fill",
            "Template fill lower coordinates cannot exceed upper coordinates.");
        }
      }
    }
  });
}

/** Requires a bounded three-coordinate integer vector for structure-local geometry. */
function validateIntegerVector(value, collector, file, path) {
  const vector = requireArray(value, collector, file, path);
  if (vector.length !== 3 || vector.some((coordinate) => !Number.isInteger(coordinate) ||
    coordinate < -64 || coordinate > 64)) {
    collector.add(file, path, "invalid-template-vector", "Expected three integer coordinates from -64 through 64.");
  }
}
