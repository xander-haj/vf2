/**
 * Generates typed registries from a fully validated snapshot and writes only during direct CLI invocation.
 * The exported function is intentionally non-writing so the editor bridge can preview exact source changes safely.
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileGeneratedFiles } from "./content-codegen.mjs";
import { PROJECT_ROOT } from "./content-files.mjs";
import { validateContentFiles } from "./validate-content.mjs";

/** ContentCompilationError preserves all validation diagnostics for editor and CLI presentation. */
export class ContentCompilationError extends Error {
  constructor(diagnostics) {
    super(`Content generation rejected ${diagnostics.length} validation error(s).`);
    this.name = "ContentCompilationError";
    this.diagnostics = diagnostics;
  }
}

/** Returns a deterministic path-to-source Map without modifying disk. */
export async function generateContentFiles(files) {
  const result = await validateContentFiles(files);
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) throw new ContentCompilationError(errors);
  return compileGeneratedFiles(result.model);
}

/** Atomically replaces each allowlisted generated file after every output has been computed successfully. */
async function writeGeneratedFiles(files) {
  for (const [path, source] of files) {
    // A full anchored pattern prevents traversal segments from escaping the generated registry directory.
    if (!/^src\/generated\/[a-z0-9][a-z0-9-]*\.ts$/u.test(path)) {
      throw new Error(`Generator refused non-allowlisted output path ${path}.`);
    }
    const destination = resolve(PROJECT_ROOT, path);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, source, "utf8");
    await rename(temporary, destination);
  }
}

/** Runs validation, deterministic generation, and atomic writes for the manual compiler command. */
async function runCli() {
  const files = await generateContentFiles();
  await writeGeneratedFiles(files);
  console.log(`Generated ${files.size} validated TypeScript registries.`);
}

// Imports remain non-writing; only an explicit Node CLI call can reach the filesystem mutation boundary.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    if (error instanceof ContentCompilationError) {
      for (const diagnostic of error.diagnostics) {
        console.error(`${diagnostic.file} ${diagnostic.path} [${diagnostic.code}] ${diagnostic.message}`);
      }
    } else {
      console.error(error instanceof Error ? error.message : "Unknown content generation failure.");
    }
    process.exitCode = 1;
  });
}
