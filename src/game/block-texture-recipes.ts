/**
 * Preserves the procedural texture recipe import path while generated content owns tile data.
 * The compatibility module can be removed after all consumers import the registry directly.
 */

export { BLOCK_TEXTURE_RECIPES } from "../generated/texture-registry";
export type { TextureRecipe } from "../generated/texture-registry";
