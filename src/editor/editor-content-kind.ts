/** Classifies canonical definitions for friendly navigation, truthful icons, and exact preview support. */

export type EditorContentKind =
  | "block"
  | "texture"
  | "asset"
  | "entity"
  | "animation"
  | "biome"
  | "worldgen"
  | "behavior"
  | "spawn"
  | "loot"
  | "dialogue"
  | "trade"
  | "project"
  | "document";

export type EditorWorkspace = "content" | "worldgen" | "entities" | "behaviors";

/** EditorContentKindInfo supplies user-facing labels without exposing physical file organization. */
export interface EditorContentKindInfo {
  readonly label: string;
  readonly category: string;
  readonly graphical: boolean;
  readonly icon: "object" | "logic" | "document";
  readonly order: number;
}

/** CONTENT_KIND_INFO is the shared browser and viewport contract for every canonical definition type. */
export const CONTENT_KIND_INFO: Readonly<Record<EditorContentKind, EditorContentKindInfo>> = {
  block: { label: "Block", category: "Blocks", graphical: true, icon: "object", order: 10 },
  texture: { label: "Look", category: "Looks & textures", graphical: true, icon: "object", order: 20 },
  asset: { label: "Model", category: "Models", graphical: true, icon: "object", order: 30 },
  entity: { label: "Creature", category: "Creatures", graphical: true, icon: "object", order: 40 },
  biome: { label: "Biome", category: "Worlds & biomes", graphical: true, icon: "object", order: 50 },
  worldgen: { label: "World", category: "Worlds & biomes", graphical: true, icon: "object", order: 51 },
  animation: { label: "Animation", category: "Animations", graphical: false, icon: "document", order: 100 },
  behavior: { label: "Behavior", category: "Behaviors", graphical: false, icon: "logic", order: 110 },
  spawn: { label: "Spawn rule", category: "Spawn rules", graphical: false, icon: "logic", order: 120 },
  loot: { label: "Reward", category: "Rewards", graphical: false, icon: "document", order: 130 },
  dialogue: { label: "Conversation", category: "Conversations", graphical: false, icon: "document", order: 140 },
  trade: { label: "Trade", category: "Trading", graphical: false, icon: "document", order: 150 },
  project: { label: "Project setting", category: "Project settings", graphical: false, icon: "document", order: 160 },
  document: { label: "Data", category: "Other data", graphical: false, icon: "document", order: 170 },
};

/** Classifies a physical source and collection name into one stable editor content kind. */
export function kindForContent(path: string, collection?: string): EditorContentKind {
  const source = `${path}/${collection ?? ""}`.toLowerCase();
  if (source.includes("behavior")) return "behavior";
  if (source.includes("spawn")) return "spawn";
  if (source.includes("animation")) return "animation";
  if (source.includes("asset")) return "asset";
  if (source.includes("entit") || source.includes("npc") || source.includes("enem")) return "entity";
  if (source.includes("biome")) return "biome";
  if (source.includes("worldgen") || source.includes("profile") || source.includes("feature") ||
      source.includes("structure")) return "worldgen";
  if (source.includes("texture")) return "texture";
  if (source.includes("block")) return "block";
  if (source.includes("loot") || source.includes("reward")) return "loot";
  if (source.includes("dialog")) return "dialogue";
  if (source.includes("trad")) return "trade";
  if (source.includes("project")) return "project";
  return "document";
}

/** Reports whether a definition has a production-backed graphical preview. */
export function isGraphicalKind(kind: string): boolean {
  return kind in CONTENT_KIND_INFO && CONTENT_KIND_INFO[kind as EditorContentKind].graphical;
}

/** Filters logical workspaces without hiding related creature assets, rewards, or interactions. */
export function kindMatchesWorkspace(kind: EditorContentKind, workspace: EditorWorkspace): boolean {
  if (workspace === "content") return true;
  if (workspace === "worldgen") return kind === "worldgen" || kind === "biome";
  if (workspace === "behaviors") return kind === "behavior";
  return ["asset", "entity", "animation", "spawn", "loot", "dialogue", "trade"].includes(kind);
}
