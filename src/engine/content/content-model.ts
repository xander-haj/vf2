/**
 * Defines the authored and compiled content contracts shared by the runtime, compiler, and editor.
 * These types contain data only, preventing canonical content from executing arbitrary source code.
 */

/** NamespacedId prevents content from relying on ambiguous unqualified resource names. */
export type NamespacedId = `${string}:${string}`;

/** RenderLayer selects the material pass required to draw a block correctly. */
export type RenderLayer = "invisible" | "opaque" | "cutout" | "translucent";

/** BlockFace identifies the three texture roles used by cube meshing. */
export type BlockFace = "top" | "bottom" | "side";

/** CompiledBlockDefinition is the complete immutable runtime meaning of one persisted byte ID. */
export interface CompiledBlockDefinition {
  readonly id: number;
  readonly contentId: NamespacedId;
  readonly name: string;
  readonly solid: boolean;
  readonly occludesFaces: boolean;
  readonly renderLayer: RenderLayer;
  readonly textures: Readonly<Record<BlockFace, string>>;
  readonly uiColor: string;
}

/** TexturePattern chooses one reviewed procedural painter rather than executable authored code. */
export type TexturePattern =
  | "noise"
  | "cap-side"
  | "wood-side"
  | "wood-top"
  | "cobblestone"
  | "strata"
  | "ice"
  | "ore"
  | "bedrock";

/** CompiledTextureRecipe describes one deterministic atlas tile. */
export interface CompiledTextureRecipe {
  readonly baseColor: string;
  readonly fleckColors: readonly string[];
  readonly salt: number;
  readonly pattern: TexturePattern;
  readonly accentColor?: string;
}

/** ContentDiagnostic is a stable editor- and CLI-readable validation result. */
export interface ContentDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

/** ContentProjectIdentity versions canonical schemas independently from saved generator identities. */
export interface ContentProjectIdentity {
  readonly schemaVersion: number;
  readonly registryVersion: number;
  readonly namespace: string;
  readonly displayName: string;
  readonly hotbar: readonly NamespacedId[];
}

/** ProceduralModelPart supplies one immutable box in an original entity model. */
export interface ProceduralModelPart {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly color: string;
}

/** AssetDefinition identifies either an embedded procedural model or a local glTF resource. */
export interface AssetDefinition {
  readonly id: NamespacedId;
  readonly type: "procedural-entity-model" | "gltf";
  readonly source?: string;
  readonly scale?: number;
  readonly parts?: readonly ProceduralModelPart[];
  readonly ownership: AssetOwnership;
}

/** AssetOwnership records provenance required before artwork can enter the generated registries. */
export interface AssetOwnership {
  readonly author: string;
  readonly license: string;
  readonly source: string;
}
