/** Creates selection-focused biome, ore, decoration, structure, and frozen-legacy world-object previews. */

import { Group, type Material, type Object3D } from "three";
import type {
  DecorationDefinition,
  EngineBiomeDefinition,
  EngineWorldgenProfile,
  OreFeatureDefinition,
  StructureDefinition,
} from "../engine/worldgen/generation-context";
import { EngineWorldGenerator } from "../engine/worldgen/engine-world-generator";
import { BLOCK_ID_BY_CONTENT_ID, BlockId } from "../generated/block-registry";
import type { TextureAtlas } from "../game/texture-atlas";
import { Chunk } from "../world/chunk";
import { ChunkMesher } from "../world/chunk-mesher";
import type { WorldDimensions } from "../world/world-profile";
import type { EditorSelection, EditorState, JsonObject, JsonValue } from "./editor-state";
import { compileEditorWorldgen } from "./editor-worldgen-compiler";

const LEGACY_PREVIEW_DIMENSIONS = { chunkSize: 16, worldHeight: 32, sectionHeight: 16 } as const;

/** Narrows canonical content before definition-specific fields are inspected. */
function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Resolves one canonical block reference so previews always use real registered materials. */
function block(value: JsonValue | undefined, fallback = BlockId.Stone): BlockId {
  if (typeof value !== "string") return fallback;
  const blockId = BLOCK_ID_BY_CONTENT_ID.get(value);
  if (blockId === undefined) throw new Error(`World preview is missing registered block asset ${value}.`);
  return blockId;
}

/** Builds meshes through the production chunk mesher and centers either terrain or isolated changed blocks. */
function meshChunk(
  chunk: Chunk,
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
  terrain: boolean,
): Group {
  const group = new Group();
  const dimensions = chunk.dimensions;
  const mesher = new ChunkMesher(materials, atlas, dimensions);
  for (let sectionIndex = 0; sectionIndex < chunk.sections.length; sectionIndex += 1) {
    const mesh = mesher.buildMesh(chunk, sectionIndex, (x, y, z) => {
      if (x < 0 || x >= dimensions.chunkSize || z < 0 || z >= dimensions.chunkSize) return BlockId.Air;
      return chunk.getBlock(x, y, z);
    });
    group.add(mesh);
  }
  group.position.x = -dimensions.chunkSize / 2;
  group.position.z = -dimensions.chunkSize / 2;
  if (terrain) {
    group.position.y = -25;
    return group;
  }
  let minimumY = dimensions.worldHeight;
  let maximumY = 0;
  for (let y = 0; y < dimensions.worldHeight; y += 1) {
    for (let z = 0; z < dimensions.chunkSize; z += 1) {
      for (let x = 0; x < dimensions.chunkSize; x += 1) {
        if (chunk.getBlock(x, y, z) === BlockId.Air) continue;
        minimumY = Math.min(minimumY, y);
        maximumY = Math.max(maximumY, y);
      }
    }
  }
  group.position.y = 2 - (minimumY + maximumY) / 2;
  return group;
}

/** Generates one exact production chunk for a profile variant and preview seed. */
function generate(
  profile: EngineWorldgenProfile,
  dimensions: WorldDimensions,
  seed: number,
): Chunk {
  const chunk = new Chunk(0, 0, dimensions);
  new EngineWorldGenerator(
    seed,
    profile,
    dimensions.chunkSize,
    dimensions.worldHeight,
    dimensions.sectionHeight,
  ).generateChunk(chunk);
  return chunk;
}

/** Copies only blocks changed by the selected production feature into a clean reveal chunk. */
function differenceChunk(before: Chunk, after: Chunk): Chunk | null {
  const result = new Chunk(0, 0, after.dimensions);
  let changes = 0;
  for (let y = 0; y < after.dimensions.worldHeight; y += 1) {
    for (let z = 0; z < after.dimensions.chunkSize; z += 1) {
      for (let x = 0; x < after.dimensions.chunkSize; x += 1) {
        const blockId = after.getBlock(x, y, z);
        if (blockId === before.getBlock(x, y, z)) continue;
        result.setBlock(x, y, z, blockId);
        changes += 1;
      }
    }
  }
  return changes === 0 ? null : result;
}

/** Selects stable plains-like terrain so isolated objects remain above water and fully visible. */
function previewBiome(profile: EngineWorldgenProfile): EngineBiomeDefinition {
  return profile.biomes.find((biome) => biome.id === "vf:plains") ?? profile.biomes[0]!;
}

/** Attaches display guidance consumed by the viewport toolbar without affecting Three.js rendering. */
function describe(group: Object3D, text: string, radius: number): Object3D {
  group.userData.previewDescription = text;
  group.userData.previewRadius = radius;
  return group;
}

/** Creates a guaranteed real-texture material card when a probabilistic shape has no cells at the preview seed. */
function createMaterialCard(
  blocks: readonly BlockId[],
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
  description: string,
): Object3D {
  const chunk = new Chunk(0, 0, LEGACY_PREVIEW_DIMENSIONS);
  [...new Set(blocks)].forEach((blockId, index) => {
    const startX = 1 + index * 4;
    for (let y = 5; y <= 8; y += 1) for (let z = 6; z <= 9; z += 1) {
      for (let x = startX; x < startX + 3; x += 1) chunk.setBlock(x, y, z, blockId);
    }
  });
  return describe(meshChunk(chunk, atlas, materials, false), description, 12);
}

/** Creates exact production terrain forced to use the selected biome's authored surface and elevation settings. */
function createBiomePreview(
  state: EditorState,
  profile: EngineWorldgenProfile,
  biome: EngineBiomeDefinition,
  dimensions: WorldDimensions,
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
): Object3D {
  const focused: EngineWorldgenProfile = {
    ...profile,
    biomes: [biome],
    ores: [],
    decorations: [],
    structures: [],
  };
  const terrain = meshChunk(generate(focused, dimensions, state.previewSeed), atlas, materials, true);
  terrain.position.y = -focused.seaLevel + 1;
  const palette = createMaterialCard(
    [biome.topBlock, biome.fillerBlock, biome.shoreBlock, biome.underwaterBlock],
    atlas,
    materials,
    "",
  );
  palette.scale.setScalar(0.55);
  palette.position.x += 14;
  const group = new Group();
  group.add(terrain, palette);
  return describe(group, `Showing only ${biome.id}, plus its real top, filler, shore, and underwater blocks`, 34);
}

/** Creates one guaranteed but otherwise production-exact ore occurrence and reveals only changed ore blocks. */
function createOrePreview(
  state: EditorState,
  profile: EngineWorldgenProfile,
  ore: OreFeatureDefinition,
  dimensions: WorldDimensions,
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
): Object3D {
  const base: EngineWorldgenProfile = {
    ...profile,
    biomes: [previewBiome(profile)],
    ores: [], decorations: [], structures: [],
  };
  const focusedOre: OreFeatureDefinition = {
    ...ore,
    attemptsPerChunk: Math.max(1, ore.attemptsPerChunk),
    chance: 1,
    exposure: "allow",
    biomeTags: [],
  };
  const changed = differenceChunk(
    generate(base, dimensions, state.previewSeed),
    generate({ ...base, ores: [focusedOre] }, dimensions, state.previewSeed),
  );
  if (changed === null) {
    return createMaterialCard(
      [ore.block, ore.deepBlock],
      atlas,
      materials,
      `${ore.id} placed no cells at this preview seed; showing its real surface and deep materials`,
    );
  }
  return describe(
    meshChunk(changed, atlas, materials, false),
    `Isolated ${ore.shape} shape using ${ore.id}'s real ore blocks`,
    12,
  );
}

/** Creates one guaranteed production decoration and reveals only blocks placed by that selected definition. */
function createDecorationPreview(
  state: EditorState,
  profile: EngineWorldgenProfile,
  feature: DecorationDefinition,
  dimensions: WorldDimensions,
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
): Object3D {
  const base: EngineWorldgenProfile = {
    ...profile,
    biomes: [previewBiome(profile)],
    ores: [], decorations: [], structures: [],
  };
  const focused: DecorationDefinition = {
    ...feature,
    attemptsPerChunk: Math.max(1, feature.attemptsPerChunk),
    chance: 1,
    biomeTags: [],
  };
  const changed = differenceChunk(
    generate(base, dimensions, state.previewSeed),
    generate({ ...base, decorations: [focused] }, dimensions, state.previewSeed),
  );
  if (changed === null) {
    return createMaterialCard(
      [feature.block, feature.secondaryBlock],
      atlas,
      materials,
      `${feature.id} placed no cells at this preview seed; showing its real authored materials`,
    );
  }
  return describe(
    meshChunk(changed, atlas, materials, false),
    `Isolated ${feature.kind} using ${feature.id}'s real shape and materials`,
    14,
  );
}

/** Creates one guaranteed production structure while preserving its exact kind, template, and material choices. */
function createStructurePreview(
  state: EditorState,
  profile: EngineWorldgenProfile,
  structure: StructureDefinition,
  dimensions: WorldDimensions,
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
): Object3D {
  const base: EngineWorldgenProfile = {
    ...profile,
    biomes: [previewBiome(profile)],
    ores: [], decorations: [], structures: [],
  };
  const focused: StructureDefinition = {
    ...structure,
    spacing: 16,
    separation: 4,
    chance: 1,
    biomeTags: [],
  };
  const changed = differenceChunk(
    generate(base, dimensions, state.previewSeed),
    generate({ ...base, structures: [focused] }, dimensions, state.previewSeed),
  );
  if (changed === null) {
    return createMaterialCard(
      [structure.foundationBlock, structure.wallBlock, structure.accentBlock],
      atlas,
      materials,
      `${structure.id} placed no cells at this preview seed; showing all real structure materials`,
    );
  }
  return describe(
    meshChunk(changed, atlas, materials, false),
    `Isolated ${structure.kind} using ${structure.id}'s real structure materials`,
    17,
  );
}

/** Resolves frozen legacy sample and band references to their exact registered surface families. */
function legacySurfaceBlock(layer: JsonObject, depth: number): BlockId {
  if (typeof layer.blockId === "string") return block(layer.blockId);
  if (layer.sampleId === "vf:frozen_surface") return depth === 0 ? BlockId.Snow : BlockId.Ice;
  if (layer.sampleId === "vf:mountain_surface") return depth === 0 ? BlockId.Stone : BlockId.Gravel;
  if (layer.bandId === "vf:terracotta_bands") return BlockId.Terracotta;
  return BlockId.Stone;
}

/** Builds a real-material layered card for one frozen legacy biome or terracotta band definition. */
function createLegacyBiomeChunk(value: JsonObject): Chunk | null {
  const chunk = new Chunk(0, 0, LEGACY_PREVIEW_DIMENSIONS);
  if (Array.isArray(value.blocks)) {
    value.blocks.forEach((blockId, index) => {
      for (let z = 4; z < 12; z += 1) for (let x = 3; x < 13; x += 1) {
        chunk.setBlock(x, 4 + index, z, block(blockId));
      }
    });
    return chunk;
  }
  if (!Array.isArray(value.surface)) return null;
  const layers = value.surface.filter(isObject);
  for (let z = 3; z < 13; z += 1) {
    for (let x = 3; x < 13; x += 1) {
      for (let y = 1; y <= 8; y += 1) chunk.setBlock(x, y, z, BlockId.Stone);
      for (let depth = 0; depth <= 7; depth += 1) {
        const layer = layers.find((entry) => typeof entry.maximumDepth === "number" && depth <= entry.maximumDepth);
        if (layer !== undefined) chunk.setBlock(x, 8 - depth, z, legacySurfaceBlock(layer, depth));
      }
    }
  }
  return chunk;
}

/** Builds distinct real-material cards for frozen legacy trees, bedrock, pockets, and ore veins. */
function createLegacyFeatureChunk(value: JsonObject): Chunk | null {
  const type = typeof value.type === "string" ? value.type : null;
  if (type === null) return null;
  const chunk = new Chunk(0, 0, LEGACY_PREVIEW_DIMENSIONS);
  const main = block(value.blockId);
  if (type === "tree") {
    for (let y = 4; y <= 10; y += 1) chunk.setBlock(8, y, 8, main);
    const leaves = block(value.leavesBlockId, BlockId.Leaves);
    for (let y = 9; y <= 12; y += 1) for (let z = 6; z <= 10; z += 1) for (let x = 6; x <= 10; x += 1) {
      if (Math.abs(x - 8) + Math.abs(z - 8) <= 3) chunk.setBlock(x, y, z, leaves);
    }
    return chunk;
  }
  if (type === "bedrock") {
    for (let y = 4; y <= 6; y += 1) for (let z = 3; z < 13; z += 1) for (let x = 3; x < 13; x += 1) {
      if ((x * 13 + y * 7 + z * 17) % 5 !== 0) chunk.setBlock(x, y, z, main);
    }
    return chunk;
  }
  const deep = block(value.depthBlockId, main);
  for (let z = 4; z < 12; z += 1) for (let y = 4; y < 12; y += 1) for (let x = 4; x < 12; x += 1) {
    const distance = Math.hypot(x - 8, y - 8, z - 8);
    const variation = Math.sin(x * 2.1 + y * 1.3 + z * 2.7 + Number(value.salt ?? 0)) * 0.55;
    if (distance + variation <= 3.4) chunk.setBlock(x, y, z, y < 8 ? deep : main);
  }
  return chunk;
}

/** Creates a selected legacy preview instead of repeating the same complete frozen seed chunk. */
function createLegacyPreview(
  selection: EditorSelection,
  value: JsonObject,
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
): Object3D | null {
  const chunk = selection.file.includes("biomes/")
    ? createLegacyBiomeChunk(value)
    : createLegacyFeatureChunk(value);
  if (chunk === null) return null;
  const id = typeof value.id === "string" ? value.id : "legacy world object";
  return describe(meshChunk(chunk, atlas, materials, false), `Isolated ${id} using real frozen assets`, 14);
}

/** Selects the exact focused preview for one clicked canonical world object, or null for whole-profile terrain. */
export function createEditorWorldObjectPreview(
  state: EditorState,
  selection: EditorSelection,
  value: JsonValue,
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
): Object3D | null {
  if (!isObject(value) || typeof value.id !== "string") return null;
  if (selection.file.includes("legacy-")) return createLegacyPreview(selection, value, atlas, materials);
  const compiled = compileEditorWorldgen(state.snapshot());
  const biome = compiled.profile.biomes.find((item) => item.id === value.id);
  if (biome !== undefined) {
    return createBiomePreview(state, compiled.profile, biome, compiled.dimensions, atlas, materials);
  }
  const ore = compiled.profile.ores.find((item) => item.id === value.id);
  if (ore !== undefined) return createOrePreview(state, compiled.profile, ore, compiled.dimensions, atlas, materials);
  const decoration = compiled.profile.decorations.find((item) => item.id === value.id);
  if (decoration !== undefined) {
    return createDecorationPreview(state, compiled.profile, decoration, compiled.dimensions, atlas, materials);
  }
  const structure = compiled.profile.structures.find((item) => item.id === value.id);
  if (structure !== undefined) {
    return createStructurePreview(state, compiled.profile, structure, compiled.dimensions, atlas, materials);
  }
  return null;
}
