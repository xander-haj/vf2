/**
 * Preserves the public block-model API while generated registries own IDs, metadata, and atlas names.
 * Existing systems can migrate independently without reintroducing handwritten content duplication.
 */

import type { CompiledBlockDefinition, BlockFace } from "../engine/content/content-model";
import { BlockId } from "../generated/block-registry";
import { TEXTURE_NAMES, type TextureName } from "../generated/texture-registry";

export { BlockId, TEXTURE_NAMES };
export type { BlockFace, TextureName };

/** BlockDefinition keeps the established runtime name for compiled canonical metadata. */
export type BlockDefinition = CompiledBlockDefinition;
