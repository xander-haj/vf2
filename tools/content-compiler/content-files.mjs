/**
 * Owns the canonical file allowlist and safe JSON loading used by compiler, tests, and editor bridge.
 * Callers cannot make validation or generation read arbitrary project paths.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The compiler root is derived from this checked-in module instead of the caller's working directory.
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** CONTENT_FILE_PATHS is the complete source-of-truth allowlist in deterministic generation order. */
export const CONTENT_FILE_PATHS = [
  "content/project.json",
  "content/blocks/surface-blocks.json",
  "content/blocks/geology-blocks.json",
  "content/textures/surface-textures.json",
  "content/textures/geology-textures.json",
  "content/textures/ore-textures.json",
  "content/worldgen/profiles/legacy-v1.json",
  "content/worldgen/profiles/engine-v2.json",
  "content/worldgen/biomes/legacy-biomes.json",
  "content/worldgen/biomes/engine-biomes.json",
  "content/worldgen/features/legacy-features.json",
  "content/worldgen/features/engine-features.json",
  "content/worldgen/structures/engine-structures.json",
  "content/assets/assets.json",
  "content/entities/npcs.json",
  "content/entities/enemies.json",
  "content/entities/passive.json",
  "content/behaviors/entity-behaviors.json",
  "content/animations/entity-animations.json",
  "content/spawn-rules/entity-spawns.json",
  "content/loot/entity-loot.json",
  "content/dialogue/npc-dialogue.json",
  "content/trading/npc-trades.json",
];

/** Converts editor Map/record input to one normalized map without accepting unknown paths. */
function normalizeProvidedFiles(files) {
  if (files instanceof Map) return files;
  if (files !== null && typeof files === "object") return new Map(Object.entries(files));
  return new Map();
}

/** Parses one source value and returns either a JSON document or one structured diagnostic. */
function parseSource(path, source) {
  if (typeof source === "object" && source !== null) return { document: source };
  if (typeof source !== "string") {
    return { diagnostic: { severity: "error", code: "invalid-source", file: path, path: "$",
      message: "Content source must be a JSON string or parsed object." } };
  }
  try {
    return { document: JSON.parse(source) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse failure.";
    return { diagnostic: { severity: "error", code: "invalid-json", file: path, path: "$", message } };
  }
}

/** Loads every allowlisted document from disk or supplied editor snapshots without writing any files. */
export async function loadContentFiles(files) {
  const documents = new Map();
  const diagnostics = [];
  const provided = files === undefined ? undefined : normalizeProvidedFiles(files);
  for (const path of CONTENT_FILE_PATHS) {
    let source;
    try {
      source = provided === undefined ? await readFile(resolve(PROJECT_ROOT, path), "utf8") : provided.get(path);
    } catch {
      diagnostics.push({ severity: "error", code: "read-failed", file: path, path: "$",
        message: "Unable to read this required canonical content file." });
      continue;
    }
    if (source === undefined) {
      diagnostics.push({ severity: "error", code: "missing-file", file: path, path: "$",
        message: "Required canonical content file is missing." });
      continue;
    }
    const parsed = parseSource(path, source);
    if (parsed.diagnostic !== undefined) diagnostics.push(parsed.diagnostic);
    if (parsed.document !== undefined) documents.set(path, parsed.document);
  }
  return { documents, diagnostics };
}
