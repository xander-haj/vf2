/**
 * Converts a validated canonical model into deterministic TypeScript registries.
 * Stable sorting and JSON serialization guarantee identical source for identical content snapshots.
 */

/** Serializes deeply readonly data using stable two-space JSON formatting. */
function literal(value) {
  return JSON.stringify(value, null, 2);
}

/** Returns the standard generated-file header used to discourage direct edits. */
function header(source) {
  return `/**\n * Generated from ${source}; direct edits are replaced by the content compiler.\n */\n\n`;
}

/** Resolves one canonical block ID to its numeric byte, throwing only after successful validation is bypassed. */
function blockNumber(id, blockMap) {
  const value = blockMap.get(id);
  if (value === undefined) throw new Error(`Cannot generate unresolved block reference ${id}.`);
  return value;
}

/** Produces the stable BlockId enum and complete runtime metadata table. */
function generateBlocks(model) {
  const blocks = [...model.registries.blocks].sort((left, right) => left.numericId - right.numericId);
  const enumLines = blocks.map((block) => `  ${block.enumName} = ${block.numericId},`).join("\n");
  const recordLines = blocks.map((block) => {
    const layer = block.renderLayer ?? (block.numericId === 0 ? "invisible" : "opaque");
    return `  { id: ${block.numericId}, contentId: ${JSON.stringify(block.id)}, ` +
      `name: ${JSON.stringify(block.name)}, solid: ${block.solid},\n` +
      `    occludesFaces: ${block.occludesFaces}, renderLayer: ${JSON.stringify(layer)},\n` +
      `    textures: ${JSON.stringify(block.textures)}, uiColor: ${JSON.stringify(block.uiColor)} },`;
  }).join("\n");
  const hotbar = model.registries.project.hotbar.map((id) => blockNumber(id,
    new Map(blocks.map((block) => [block.id, block.numericId]))));
  return header("canonical block content") +
    `import type { CompiledBlockDefinition } from "../engine/content/content-model";\n\n` +
    `export enum BlockId {\n${enumLines}\n}\n\n` +
    `const COMPILED_BLOCKS = [\n${recordLines}\n] as const;\n\n` +
    `export const BLOCK_DEFINITIONS = Object.fromEntries(\n` +
    `  COMPILED_BLOCKS.map((block) => [block.id, block]),\n` +
    `) as unknown as Readonly<Record<BlockId, CompiledBlockDefinition>>;\n\n` +
    `export const BLOCK_ID_BY_CONTENT_ID = new Map<string, BlockId>(\n` +
    `  COMPILED_BLOCKS.map((block) => [block.contentId, block.id as BlockId]),\n);\n\n` +
    `export const HOTBAR_BLOCKS: readonly BlockId[] = ${literal(hotbar)};\n`;
}

/** Produces atlas order, recipes, and inherited ownership metadata from canonical texture documents. */
function generateTextures(model) {
  void model;
  return header("canonical texture content") + `import geology from ` +
    `"../../content/textures/geology-textures.json";\n` +
    `import ores from "../../content/textures/ore-textures.json";\n` +
    `import surface from "../../content/textures/surface-textures.json";\n` +
    `import type { CompiledTextureRecipe, TexturePattern } from ` +
    `"../engine/content/content-model";\n\n` +
    `export type TextureName = string;\nexport type TextureRecipe = CompiledTextureRecipe;\n\n` +
    `/** Source is the validated common shape shared by each canonical recipe file. */\n` +
    `interface Source { id: string; baseColor: string; fleckColors: readonly string[]; salt: number;\n` +
    `  pattern: string; accentColor?: string }\n` +
    `const SOURCES: readonly Source[] = [...surface.textures, ...geology.textures, ...ores.textures];\n` +
    `export const TEXTURE_NAMES: readonly TextureName[] = SOURCES.map((texture) => texture.id);\n` +
    `export const BLOCK_TEXTURE_RECIPES = Object.fromEntries(SOURCES.map((source) => {\n` +
    `  const recipe: TextureRecipe = { baseColor: source.baseColor, fleckColors: source.fleckColors,\n` +
    `    salt: source.salt, pattern: source.pattern as TexturePattern,\n` +
    `    ...(source.accentColor === undefined ? {} : { accentColor: source.accentColor }) };\n` +
    `  return [source.id, recipe];\n` +
    `})) as Readonly<Record<TextureName, TextureRecipe>>;\n` +
    `export const TEXTURE_OWNERSHIP = [surface.ownership, geology.ownership, ores.ownership] as const;\n`;
}

/** Converts canonical engine worldgen references and range tuples to the production runtime contract. */
function generateEngineRegistry() {
  return header("canonical engine-v2 world-generation content") +
    `import biomes from "../../content/worldgen/biomes/engine-biomes.json";\n` +
    `import features from "../../content/worldgen/features/engine-features.json";\n` +
    `import profile from "../../content/worldgen/profiles/engine-v2.json";\n` +
    `import structures from "../../content/worldgen/structures/engine-structures.json";\n` +
    `import { BLOCK_ID_BY_CONTENT_ID, type BlockId } from "./block-registry";\n` +
    `import type { DecorationDefinition, EngineWorldgenProfile, OreFeatureDefinition, OreShape,\n` +
    `  StructureDefinition } from ` +
    `"../engine/worldgen/generation-context";\n\n` +
    `/** CanonicalTemplateOperation is safe because the compiler validates tuple bounds before generation. */\n` +
    `interface CanonicalTemplateOperation { blockId: string; offset?: readonly number[];\n` +
    `  fill?: { from: readonly number[]; to: readonly number[] } }\n` +
    `/** CanonicalStructure adds optional template data to the common generated structure fields. */\n` +
    `interface CanonicalStructure { id: string; salt: number; kind: string; spacing: number;\n` +
    `  separation: number; chance: number; biomeTags: readonly string[]; foundationBlockId: string;\n` +
    `  wallBlockId: string; accentBlockId: string; template?: readonly CanonicalTemplateOperation[] }\n` +
    `const STRUCTURE_SOURCES = structures.structures as unknown as readonly CanonicalStructure[];\n\n` +
    `/** Resolves one compiler-validated content ID to its persisted numeric block value. */\n` +
    `const block = (id: string): BlockId => { const value = BLOCK_ID_BY_CONTENT_ID.get(id);\n` +
    `  if (value === undefined) throw new Error(\`Generated worldgen references unknown block \${id}.\`);\n` +
    `  return value; };\n` +
    `/** Converts a validated tuple to the runtime's named inclusive range. */\n` +
    `const range = (value: readonly number[]) => ({ minimum: value[0] ?? 0, maximum: value[1] ?? 0 });\n\n` +
    `export const ENGINE_WORLDGEN_PROFILE: EngineWorldgenProfile = {\n` +
    `  dimensionId: profile.id, streams: profile.streams, seaLevel: profile.seaLevel,\n` +
    `  lavaLevel: profile.lavaLevel, terrain: profile.terrain, caves: profile.caves,\n` +
    `  climate: profile.climate, aquifers: profile.aquifers,\n` +
    `  bedrock: { maximumHeight: profile.bedrock.maximumHeight, block: block(profile.bedrock.blockId) },\n` +
    `  biomes: biomes.biomes.map((item) => ({ id: item.id, temperature: range(item.temperature),\n` +
    `    humidity: range(item.humidity), continentalness: range(item.continentalness),\n` +
    `    elevationBias: item.elevationBias, elevationScale: item.elevationScale, topBlock: block(item.topBlockId),\n` +
    `    fillerBlock: block(item.fillerBlockId), fillerDepth: item.fillerDepth,\n` +
    `    shoreBlock: block(item.shoreBlockId),\n` +
    `    underwaterBlock: block(item.underwaterBlockId), tags: item.tags })),\n` +
    `  ores: features.ores.map((item) => ({ ...item, block: block(item.blockId),\n` +
    `    deepBlock: block(item.deepBlockId), shape: item.shape as OreShape,\n` +
    `    distribution: item.distribution as OreFeatureDefinition["distribution"],\n` +
    `    exposure: item.exposure as OreFeatureDefinition["exposure"] })),\n` +
    `  decorations: features.decorations.map((item) => ({ ...item, block: block(item.blockId),\n` +
    `    secondaryBlock: block(item.secondaryBlockId), kind: item.kind as DecorationDefinition["kind"] })),\n` +
    `  structures: STRUCTURE_SOURCES.map((item) => ({ ...item,\n` +
    `    foundationBlock: block(item.foundationBlockId), wallBlock: block(item.wallBlockId),\n` +
    `    accentBlock: block(item.accentBlockId), kind: item.kind as StructureDefinition["kind"],\n` +
    `    template: item.template?.map((operation) => ({ block: block(operation.blockId),\n` +
    `      offset: operation.offset as readonly [number, number, number] | undefined,\n` +
    `      fill: operation.fill as { readonly from: readonly [number, number, number];\n` +
    `        readonly to: readonly [number, number, number] } | undefined })) })),\n};\n`;
}

/** Resolves block references inside loot and trade definitions to stable numeric IDs. */
function compileInteractions(model, blockMap) {
  const loot = model.documents.get("content/loot/entity-loot.json").lootTables.map((table) => ({
    ...table, entries: table.entries.map((entry) => ({ ...entry, blockId: blockNumber(entry.blockId, blockMap) })),
  }));
  const trades = model.documents.get("content/trading/npc-trades.json").tradeTables.map((table) => ({
    ...table, offers: table.offers.map((offer) => ({ ...offer,
      costBlockId: blockNumber(offer.costBlockId, blockMap),
      resultBlockId: blockNumber(offer.resultBlockId, blockMap) })),
  }));
  return { loot, trades };
}

/** Builds every generated output from one already validated canonical model. */
export function compileGeneratedFiles(model) {
  const files = new Map();
  const documents = model.documents;
  const blocks = [...model.registries.blocks].sort((left, right) => left.numericId - right.numericId);
  const blockMap = new Map(blocks.map((block) => [block.id, block.numericId]));
  const entities = ["content/entities/npcs.json", "content/entities/enemies.json", "content/entities/passive.json"]
    .flatMap((path) => documents.get(path).entities);
  const interactions = compileInteractions(model, blockMap);
  files.set("src/generated/project-registry.ts", header("content/project.json") +
    `export const PROJECT_REGISTRY = ${literal(model.registries.project)} as const;\n`);
  files.set("src/generated/block-registry.ts", generateBlocks(model));
  files.set("src/generated/texture-registry.ts", generateTextures(model));
  files.set("src/generated/legacy-worldgen-registry.ts", header("legacy world-generation content") +
    `export const LEGACY_WORLDGEN_REGISTRY = ${literal({ profile: documents.get(PROFILE_PATH),
      biomeSet: documents.get(LEGACY_BIOME_PATH), featureSet: documents.get(LEGACY_FEATURE_PATH) })} as const;\n`);
  files.set("src/generated/engine-worldgen-registry.ts", generateEngineRegistry());
  files.set("src/generated/asset-registry.ts", header("content/assets/assets.json") +
    `export const ASSET_DEFINITIONS = ${literal(model.registries.assets)} as const;\n`);
  files.set("src/generated/entity-registry.ts", header("canonical entity and animation content") +
    `export const ENTITY_DEFINITIONS = ${literal(entities)} as const;\n\n` +
    `export const ENTITY_ANIMATION_SETS = ${literal(documents.get(ANIMATION_PATH).animationSets)} as const;\n`);
  files.set("src/generated/behavior-registry.ts", header("content/behaviors/entity-behaviors.json") +
    `export const BEHAVIOR_GRAPHS = ${literal(documents.get(BEHAVIOR_PATH).graphs)} as const;\n`);
  files.set("src/generated/spawn-registry.ts", header("content/spawn-rules/entity-spawns.json") +
    `export const ENTITY_SPAWN_RULES = ${literal(documents.get(SPAWN_PATH).spawnRules)} as const;\n`);
  files.set("src/generated/interaction-registry.ts", header("canonical interaction content") +
    `export const LOOT_TABLES = ${literal(interactions.loot)} as const;\n\n` +
    `export const DIALOGUE_DEFINITIONS = ${literal(documents.get(DIALOGUE_PATH).dialogues)} as const;\n\n` +
    `export const TRADE_TABLES = ${literal(interactions.trades)} as const;\n`);
  return files;
}

const PROFILE_PATH = "content/worldgen/profiles/legacy-v1.json";
const LEGACY_BIOME_PATH = "content/worldgen/biomes/legacy-biomes.json";
const LEGACY_FEATURE_PATH = "content/worldgen/features/legacy-features.json";
const ANIMATION_PATH = "content/animations/entity-animations.json";
const BEHAVIOR_PATH = "content/behaviors/entity-behaviors.json";
const SPAWN_PATH = "content/spawn-rules/entity-spawns.json";
const DIALOGUE_PATH = "content/dialogue/npc-dialogue.json";
