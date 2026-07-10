/**
 * Orchestrates complete canonical validation for CLI, tests, and the non-writing editor bridge.
 * Validation always covers the full allowlist so partial snapshots cannot bypass cross-reference checks.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DiagnosticCollector } from "./common-validation.mjs";
import { loadContentFiles } from "./content-files.mjs";
import { validateEntities } from "./entity-validation.mjs";
import { validateRegistries } from "./registry-validation.mjs";
import { validateWorldgen } from "./worldgen-validation.mjs";

/** Validates disk content or a complete Map/record snapshot and returns every deterministic diagnostic. */
export async function validateContentFiles(files) {
  const loaded = await loadContentFiles(files);
  const collector = new DiagnosticCollector(loaded.diagnostics);
  const registries = validateRegistries(loaded.documents, collector);
  const worldgen = validateWorldgen(loaded.documents, registries, collector);
  const entities = validateEntities(loaded.documents, { ...registries, biomeIds: worldgen.biomeIds }, collector);
  collector.diagnostics.sort((left, right) =>
    left.file.localeCompare(right.file) || left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  return { diagnostics: collector.diagnostics, model: { documents: loaded.documents, registries, worldgen, entities } };
}

/** Prints safe diagnostics for manual CLI validation and assigns a failing exit code on any error. */
async function runCli() {
  const result = await validateContentFiles();
  for (const diagnostic of result.diagnostics) {
    console.error(`${diagnostic.severity.toUpperCase()} ${diagnostic.file} ${diagnostic.path} ` +
      `[${diagnostic.code}] ${diagnostic.message}`);
  }
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) process.exitCode = 1;
  else console.log("Canonical content validation completed without errors.");
}

// Direct invocation runs the CLI; module imports remain side-effect free for editor and tests.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown content validation failure.");
    process.exitCode = 1;
  });
}
