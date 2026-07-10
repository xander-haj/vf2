/** Builds exact production-meshed chunks for current, saved, legacy, and comparison editor views. */

// Production generation, storage, meshing, and atlas boundaries keep preview output identical to gameplay.
import { Group, type Material } from "three";
import { EngineWorldGenerator } from "../engine/worldgen/engine-world-generator";
import { BlockId } from "../game/block-model";
import type { TextureAtlas } from "../game/texture-atlas";
import { ENGINE_WORLDGEN_PROFILE } from "../generated/engine-worldgen-registry";
import { Chunk } from "../world/chunk";
import { ChunkMesher } from "../world/chunk-mesher";
import { WorldGenerator } from "../world/world-generator";
import { LEGACY_WORLD_PROFILE } from "../world/world-profile";
import type { EditorState } from "./editor-state";
import { compileEditorWorldgen } from "./editor-worldgen-compiler";

export type TerrainPreviewMode = "current" | "saved" | "legacy";

/** Generates one real chunk and passes it through the same section mesher used by World. */
export function createEditorTerrainPreview(
  state: EditorState,
  atlas: TextureAtlas,
  materials: readonly [Material, Material],
  mode: TerrainPreviewMode,
): Group {
  const compiled = mode === "legacy" ? null : compileEditorWorldgen(state.snapshot());
  const dimensions = compiled?.dimensions ?? LEGACY_WORLD_PROFILE.dimensions;
  const chunk = new Chunk(0, 0, dimensions);
  // Saved comparison uses generated content; current uses the complete unsaved canonical adapter.
  if (mode === "legacy") {
    const generator = new WorldGenerator(state.previewSeed, LEGACY_WORLD_PROFILE);
    generator.generateChunk(chunk);
    generator.dispose();
  } else {
    const profile = mode === "saved" ? ENGINE_WORLDGEN_PROFILE : compiled?.profile;
    if (profile === undefined) throw new Error("Engine world-generation profile is unavailable.");
    new EngineWorldGenerator(
      state.previewSeed,
      profile,
      dimensions.chunkSize,
      dimensions.worldHeight,
      dimensions.sectionHeight,
    ).generateChunk(chunk);
  }
  const group = new Group();
  const mesher = new ChunkMesher(materials, atlas, dimensions);
  // Boundary air deliberately exposes a cutaway edge while every interior face follows production neighbor rules.
  for (let sectionIndex = 0; sectionIndex < chunk.sections.length; sectionIndex += 1) {
    const mesh = mesher.buildMesh(chunk, sectionIndex, (x, y, z) => {
      if (x < 0 || x >= dimensions.chunkSize || z < 0 || z >= dimensions.chunkSize) return BlockId.Air;
      return chunk.getBlock(x, y, z);
    });
    group.add(mesh);
  }
  const seaLevel = compiled?.profile.seaLevel ?? 25;
  group.position.set(-dimensions.chunkSize / 2, -seaLevel + 1, -dimensions.chunkSize / 2);
  return group;
}
