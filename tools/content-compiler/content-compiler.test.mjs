/**
 * Verifies deterministic generation and rejection of schema, duplicate, reference, compatibility, and graph defects.
 * Tests use complete in-memory snapshots so they never modify canonical or generated project files.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { CONTENT_FILE_PATHS, PROJECT_ROOT } from "./content-files.mjs";
import { ContentCompilationError, generateContentFiles } from "./generate-content.mjs";
import { validateContentFiles } from "./validate-content.mjs";

/** Loads one complete canonical snapshot as strings to exercise the same boundary used by the editor bridge. */
async function loadSnapshot() {
  const files = new Map();
  for (const path of CONTENT_FILE_PATHS) files.set(path, await readFile(resolve(PROJECT_ROOT, path), "utf8"));
  return files;
}

/** Clones and mutates one JSON document while preserving every other canonical source string. */
function mutate(snapshot, path, mutation) {
  const copy = new Map(snapshot);
  const document = JSON.parse(copy.get(path));
  mutation(document);
  copy.set(path, JSON.stringify(document));
  return copy;
}

/** Returns true when one validation result contains the requested stable diagnostic code. */
function hasCode(result, code) {
  return result.diagnostics.some((diagnostic) => diagnostic.code === code);
}

test("canonical snapshot validates every schema and reference", async () => {
  const result = await validateContentFiles(await loadSnapshot());
  assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
});

test("identical content produces byte-identical generated sources", async () => {
  const snapshot = await loadSnapshot();
  const first = await generateContentFiles(snapshot);
  const second = await generateContentFiles(snapshot);
  assert.deepEqual([...first.entries()], [...second.entries()]);
  assert.equal(first.size, 10);
});

test("every canonical document rejects unsupported schema versions", async () => {
  const snapshot = await loadSnapshot();
  for (const path of CONTENT_FILE_PATHS) {
    const invalid = mutate(snapshot, path, (document) => { document.schemaVersion = 99; });
    assert.equal(hasCode(await validateContentFiles(invalid), "unsupported-schema"), true, path);
  }
});

test("generator identities and registry versions are enforced", async () => {
  const snapshot = await loadSnapshot();
  const invalid = mutate(snapshot, "content/worldgen/profiles/engine-v2.json", (document) => {
    document.generatorVersion = 3;
  });
  assert.equal(hasCode(await validateContentFiles(invalid), "engine-version-mismatch"), true);
});

test("duplicate IDs and dangling texture references are rejected", async () => {
  const snapshot = await loadSnapshot();
  const duplicate = mutate(snapshot, "content/blocks/surface-blocks.json", (document) => {
    document.blocks[1].id = document.blocks[0].id;
  });
  assert.equal(hasCode(await validateContentFiles(duplicate), "duplicate-id"), true);
  const dangling = mutate(snapshot, "content/blocks/surface-blocks.json", (document) => {
    document.blocks[1].textures.top = "missing-tile";
  });
  assert.equal(hasCode(await validateContentFiles(dangling), "missing-reference"), true);
});

test("frozen legacy numeric assignments cannot be swapped", async () => {
  const snapshot = await loadSnapshot();
  const invalid = mutate(snapshot, "content/blocks/surface-blocks.json", (document) => {
    const grass = document.blocks[1].numericId;
    document.blocks[1].numericId = document.blocks[2].numericId;
    document.blocks[2].numericId = grass;
  });
  assert.equal(hasCode(await validateContentFiles(invalid), "legacy-id-changed"), true);
});

test("behavior graph cycles are rejected", async () => {
  const snapshot = await loadSnapshot();
  const invalid = mutate(snapshot, "content/behaviors/entity-behaviors.json", (document) => {
    document.graphs[0].nodes[1].children.push("root");
  });
  assert.equal(hasCode(await validateContentFiles(invalid), "graph-cycle"), true);
});

test("generation rejects invalid content without returning partial files", async () => {
  const snapshot = await loadSnapshot();
  const invalid = mutate(snapshot, "content/entities/passive.json", (document) => {
    document.entities[0].modelAssetId = "vf:missing_model";
  });
  await assert.rejects(() => generateContentFiles(invalid), ContentCompilationError);
});
