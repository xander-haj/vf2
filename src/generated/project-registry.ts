/**
 * Generated from content/project.json; edits are replaced by the deterministic content compiler.
 * Runtime systems use this identity to bind hotbar content and registry compatibility.
 */

/** PROJECT_REGISTRY exposes the canonical project identity as deeply readonly data. */
export const PROJECT_REGISTRY = {
  schemaVersion: 1,
  registryVersion: 2,
  namespace: "vf",
  displayName: "Voxel Frontier",
  hotbar: ["vf:grass", "vf:dirt", "vf:stone", "vf:sand", "vf:wood", "vf:leaves", "vf:cobblestone"],
} as const;
