/**
 * Exposes the authoritative block API consumed by terrain, rendering, collision, storage, and interface systems.
 * The public module preserves existing imports while the expanded model and catalog live in focused files.
 */

import { BLOCK_DEFINITIONS, HOTBAR_BLOCKS } from "./block-definitions";
import { BlockId, type BlockDefinition, type BlockFace, type TextureName } from "./block-model";

export { BLOCK_DEFINITIONS, BlockId, HOTBAR_BLOCKS };
export type { BlockDefinition, BlockFace, TextureName };

/** Returns validated metadata for a block identifier; unknown runtime data becomes air safely. */
export function getBlockDefinition(blockId: BlockId): BlockDefinition {
  return BLOCK_DEFINITIONS[blockId] ?? BLOCK_DEFINITIONS[BlockId.Air];
}

/** Reports whether the player must collide with the requested block. */
export function isSolidBlock(blockId: BlockId): boolean {
  return getBlockDefinition(blockId).solid;
}

/** Reports whether a neighboring cube can hide a face during mesh construction. */
export function blockOccludesFaces(blockId: BlockId): boolean {
  return getBlockDefinition(blockId).occludesFaces;
}

/** Returns the render pass used for invisible, opaque, or blended voxel geometry. */
export function getBlockRenderLayer(blockId: BlockId): BlockDefinition["renderLayer"] {
  return getBlockDefinition(blockId).renderLayer;
}

/** Reports whether one block face remains visible beside a neighboring block. */
export function shouldRenderBlockFace(blockId: BlockId, neighborId: BlockId): boolean {
  const layer = getBlockRenderLayer(blockId);
  if (layer === "invisible") {
    return false;
  }
  if (layer === "translucent" && getBlockRenderLayer(neighborId) === "translucent") {
    // A stable ID tie-break emits one boundary face between unlike fluids and none inside one fluid volume.
    return blockId < neighborId;
  }
  return !blockOccludesFaces(neighborId);
}

/** Selects the appropriate atlas texture for a horizontal, upper, or lower cube face. */
export function getBlockTexture(blockId: BlockId, face: BlockFace): TextureName {
  return getBlockDefinition(blockId).textures[face];
}

/** Validates untrusted persisted numbers before they enter typed world storage. */
export function isBlockId(value: unknown): value is BlockId {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= BlockId.Air &&
    value <= BlockId.Lava
  );
}
