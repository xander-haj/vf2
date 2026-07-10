/**
 * Validates project, block, texture, and asset registries plus every direct cross-reference.
 * The returned indexes are reused by world-generation and entity validation without reparsing files.
 */

import {
  HEX_COLOR_PATTERN,
  NAMESPACED_ID_PATTERN,
  requireArray,
  requireBoolean,
  requireChoice,
  requireInteger,
  requireNumber,
  requireObject,
  requireReference,
  requireString,
  requireUniqueId,
  validateSchema,
} from "./common-validation.mjs";

const BLOCK_FILES = ["content/blocks/surface-blocks.json", "content/blocks/geology-blocks.json"];
const TEXTURE_FILES = ["content/textures/surface-textures.json", "content/textures/geology-textures.json",
  "content/textures/ore-textures.json"];
const TEXTURE_PATTERNS = ["noise", "cap-side", "wood-side", "wood-top", "cobblestone", "strata", "ice",
  "ore", "bedrock"];

// IDs 0 through 52 shipped before authoring and must never be reassigned by the GUI or compiler.
const FROZEN_LEGACY_BLOCK_IDS = [
  "vf:air", "vf:grass", "vf:dirt", "vf:stone", "vf:sand", "vf:wood", "vf:leaves", "vf:cobblestone",
  "vf:bedrock", "vf:gravel", "vf:clay", "vf:sandstone", "vf:red_sand", "vf:red_sandstone",
  "vf:coarse_dirt", "vf:podzol", "vf:mycelium", "vf:mud", "vf:moss", "vf:snow", "vf:ice",
  "vf:packed_ice", "vf:blue_ice", "vf:granite", "vf:diorite", "vf:andesite", "vf:deepslate", "vf:tuff",
  "vf:calcite", "vf:dripstone", "vf:terracotta", "vf:white_terracotta", "vf:orange_terracotta",
  "vf:yellow_terracotta", "vf:red_terracotta", "vf:brown_terracotta", "vf:light_gray_terracotta",
  "vf:coal_ore", "vf:iron_ore", "vf:copper_ore", "vf:gold_ore", "vf:redstone_ore", "vf:lapis_ore",
  "vf:diamond_ore", "vf:emerald_ore", "vf:deepslate_coal_ore", "vf:deepslate_iron_ore",
  "vf:deepslate_copper_ore", "vf:deepslate_gold_ore", "vf:deepslate_redstone_ore",
  "vf:deepslate_lapis_ore", "vf:deepslate_diamond_ore", "vf:deepslate_emerald_ore",
];

/** Validates the foundational registries and returns resolved sets needed by dependent validators. */
export function validateRegistries(documents, collector) {
  const blockIds = new Set();
  const blockNumbers = new Set();
  const enumNames = new Set();
  const textureIds = new Set();
  const assetIds = new Set();
  const blocks = [];
  const textures = [];

  for (const file of TEXTURE_FILES) {
    const document = validateSchema(documents.get(file), collector, file);
    validateOwnership(document?.ownership, collector, file, "$.ownership");
    const records = requireArray(document?.textures, collector, file, "$.textures");
    records.forEach((value, index) => {
      const path = `$.textures[${index}]`;
      const record = requireObject(value, collector, file, path);
      if (record === null) return;
      const id = requireString(record.id, collector, file, `${path}.id`);
      requireUniqueId(id, textureIds, collector, file, `${path}.id`, "texture");
      requireString(record.baseColor, collector, file, `${path}.baseColor`, HEX_COLOR_PATTERN);
      const flecks = requireArray(record.fleckColors, collector, file, `${path}.fleckColors`);
      if (flecks.length === 0) collector.add(file, `${path}.fleckColors`, "empty-palette",
        "At least one fleck is required.");
      flecks.forEach((color, colorIndex) => requireString(color, collector, file,
        `${path}.fleckColors[${colorIndex}]`, HEX_COLOR_PATTERN));
      requireInteger(record.salt, collector, file, `${path}.salt`, 0, 2147483647);
      requireChoice(record.pattern, TEXTURE_PATTERNS, collector, file, `${path}.pattern`);
      if (record.accentColor !== undefined) {
        requireString(record.accentColor, collector, file, `${path}.accentColor`, HEX_COLOR_PATTERN);
      }
      textures.push(record);
    });
  }

  for (const file of BLOCK_FILES) {
    const document = validateSchema(documents.get(file), collector, file);
    const records = requireArray(document?.blocks, collector, file, "$.blocks");
    records.forEach((value, index) => {
      const path = `$.blocks[${index}]`;
      const record = requireObject(value, collector, file, path);
      if (record === null) return;
      const id = requireString(record.id, collector, file, `${path}.id`, NAMESPACED_ID_PATTERN);
      requireUniqueId(id, blockIds, collector, file, `${path}.id`, "block");
      const numericId = requireInteger(record.numericId, collector, file, `${path}.numericId`, 0, 255);
      if (numericId !== null) requireUniqueId(numericId, blockNumbers, collector, file,
        `${path}.numericId`, "numeric block");
      const enumName = requireString(record.enumName, collector, file, `${path}.enumName`, /^[A-Z][A-Za-z0-9]*$/);
      requireUniqueId(enumName, enumNames, collector, file, `${path}.enumName`, "block enum");
      requireString(record.name, collector, file, `${path}.name`);
      requireBoolean(record.solid, collector, file, `${path}.solid`);
      requireBoolean(record.occludesFaces, collector, file, `${path}.occludesFaces`);
      requireString(record.uiColor, collector, file, `${path}.uiColor`, HEX_COLOR_PATTERN);
      if (record.renderLayer !== undefined) requireChoice(record.renderLayer,
        ["invisible", "opaque", "cutout", "translucent"], collector, file, `${path}.renderLayer`);
      const faces = requireObject(record.textures, collector, file, `${path}.textures`);
      for (const face of ["top", "bottom", "side"]) {
        if (faces !== null && !textureIds.has(faces[face])) collector.add(file, `${path}.textures.${face}`,
          "missing-reference", `Unknown texture ID ${String(faces[face])}.`);
      }
      blocks.push(record);
    });
  }

  const orderedNumbers = [...blockNumbers].sort((left, right) => left - right);
  orderedNumbers.forEach((value, index) => {
    if (value !== index) collector.add("content/blocks", "$", "numeric-id-gap",
      `Numeric block IDs must remain contiguous; expected ${index} but found ${value}.`);
  });
  for (const [numericId, expectedId] of FROZEN_LEGACY_BLOCK_IDS.entries()) {
    const actual = blocks.find((block) => block.numericId === numericId)?.id;
    if (actual !== expectedId) collector.add("content/blocks", "$", "legacy-id-changed",
      `Frozen numeric block ID ${numericId} must remain ${expectedId}; found ${String(actual)}.`);
  }

  const projectFile = "content/project.json";
  const project = validateSchema(documents.get(projectFile), collector, projectFile);
  requireInteger(project?.registryVersion, collector, projectFile, "$.registryVersion", 1);
  requireString(project?.namespace, collector, projectFile, "$.namespace", /^[a-z][a-z0-9_-]*$/);
  requireString(project?.displayName, collector, projectFile, "$.displayName");
  requireArray(project?.hotbar, collector, projectFile, "$.hotbar").forEach((id, index) =>
    requireReference(id, blockIds, collector, projectFile, `$.hotbar[${index}]`, "block"));

  const assetFile = "content/assets/assets.json";
  const assetDocument = validateSchema(documents.get(assetFile), collector, assetFile);
  const assets = requireArray(assetDocument?.assets, collector, assetFile, "$.assets");
  assets.forEach((value, index) => {
    const path = `$.assets[${index}]`;
    const asset = requireObject(value, collector, assetFile, path);
    if (asset === null) return;
    const id = requireString(asset.id, collector, assetFile, `${path}.id`, NAMESPACED_ID_PATTERN);
    requireUniqueId(id, assetIds, collector, assetFile, `${path}.id`, "asset");
    const type = requireChoice(asset.type, ["procedural-entity-model", "gltf"], collector, assetFile,
      `${path}.type`);
    validateOwnership(asset.ownership, collector, assetFile, `${path}.ownership`);
    if (type === "procedural-entity-model") validateProceduralParts(asset.parts, collector, assetFile, path);
    if (type === "gltf") {
      const source = requireString(asset.source, collector, assetFile, `${path}.source`,
        /^\/assets\/[A-Za-z0-9_./-]+\.glb$/);
      if (source !== null && source.split("/").includes("..")) collector.add(assetFile, `${path}.source`,
        "unsafe-asset-path", "glTF source paths cannot traverse outside the public assets directory.");
    }
    if (asset.scale !== undefined) requireNumber(asset.scale, collector, assetFile, `${path}.scale`, 0.001, 100);
  });
  return { project, blocks, textures, assets, blockIds, textureIds, assetIds };
}

/** Requires explicit project-original or externally attributable ownership metadata. */
function validateOwnership(value, collector, file, path) {
  const ownership = requireObject(value, collector, file, path);
  if (ownership === null) return;
  requireString(ownership.author, collector, file, `${path}.author`);
  requireString(ownership.license, collector, file, `${path}.license`);
  requireString(ownership.source, collector, file, `${path}.source`);
}

/** Validates bounded box-model parts used when an entity has no external GLB asset. */
function validateProceduralParts(value, collector, file, parentPath) {
  const parts = requireArray(value, collector, file, `${parentPath}.parts`);
  if (parts.length === 0 || parts.length > 64) collector.add(file, `${parentPath}.parts`, "invalid-part-count",
    "Procedural models require between 1 and 64 parts.");
  const names = new Set();
  parts.forEach((item, index) => {
    const path = `${parentPath}.parts[${index}]`;
    const part = requireObject(item, collector, file, path);
    if (part === null) return;
    const name = requireString(part.name, collector, file, `${path}.name`, /^[A-Za-z][A-Za-z0-9_-]*$/);
    requireUniqueId(name, names, collector, file, `${path}.name`, "model part");
    for (const key of ["size", "position"]) {
      const vector = requireArray(part[key], collector, file, `${path}.${key}`);
      if (vector.length !== 3 || vector.some((number) => typeof number !== "number" || !Number.isFinite(number))) {
        collector.add(file, `${path}.${key}`, "invalid-vector", "Expected three finite coordinates.");
      }
    }
    if (Array.isArray(part.size) && part.size.some((number) => typeof number === "number" && number <= 0)) {
      collector.add(file, `${path}.size`, "invalid-size", "Model part dimensions must be positive.");
    }
    requireString(part.color, collector, file, `${path}.color`, HEX_COLOR_PATTERN);
  });
}
