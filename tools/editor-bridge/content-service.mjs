/** Secure content transactions shared by the local editor's Vite middleware. */

// Node built-ins provide hashing and constrained filesystem transactions without expanding project dependencies.
import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { generateContentFiles } from "../content-compiler/generate-content.mjs";
import { validateContentFiles } from "../content-compiler/validate-content.mjs";
import { CONTENT_FILE_PATHS } from "../content-compiler/content-files.mjs";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const CONTENT_PATH = /^content\/[a-z0-9][a-z0-9/-]*\.json$/u;
const GENERATED_PATH = /^src\/generated\/[a-z0-9][a-z0-9-]*\.ts$/u;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Recursively sorts object keys so semantically equal snapshots produce the same concurrency hash. */
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

/** Hashes canonical semantic JSON rather than filesystem formatting or timestamps. */
function snapshotHash(files) {
  const ordered = Object.fromEntries(Object.keys(files).sort().map((path) => [path, stableValue(files[path])]));
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

/** Rejects unsafe keys, excessive nesting, non-finite numbers, and pathological node counts before compilation. */
function assertSafeJson(files) {
  const pending = [{ value: files, depth: 0 }];
  let nodes = 0;
  // Iterative traversal prevents attacker-controlled nesting from exhausting the JavaScript call stack.
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > 200000 || current.depth > 80) throw new Error("Editor content exceeds structural safety limits.");
    if (typeof current.value === "number" && !Number.isFinite(current.value)) {
      throw new Error("Editor content cannot contain non-finite numbers.");
    }
    if (current.value === null || typeof current.value !== "object") continue;
    for (const [key, value] of Object.entries(current.value)) {
      if (UNSAFE_KEYS.has(key)) throw new Error("Editor content contains an unsafe object key.");
      pending.push({ value, depth: current.depth + 1 });
    }
  }
}

/** Restricts editor traffic to literal loopback hostnames and addresses. */
function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** Extracts a comparable origin from same-origin browser headers without trusting malformed URLs. */
function requestOrigin(request) {
  const source = request.headers.origin ?? request.headers.referer;
  if (typeof source !== "string") return null;
  try { return new URL(source).origin; } catch { return null; }
}

/** Requires matching loopback Host and Origin values plus the per-process capability token. */
function authorize(request, token) {
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try { hostUrl = new URL(`http://${host}`); } catch { return false; }
  const origin = requestOrigin(request);
  if (!isLoopback(hostUrl.hostname) || origin === null) return false;
  let originUrl;
  try { originUrl = new URL(origin); } catch { return false; }
  return originUrl.protocol === "http:" && isLoopback(originUrl.hostname) && originUrl.host === hostUrl.host &&
    request.headers["x-vf-editor-token"] === token;
}

/** Sends one no-store JSON response with browser content-sniffing protection. */
function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(body);
}

/** Reads a bounded JSON object body and rejects oversized or structurally invalid input. */
async function readJsonBody(request) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error("Content request exceeds the 4 MiB editor limit.");
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new Error("Content request exceeds the 4 MiB editor limit.");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Editor request body must be a JSON object.");
  }
  return parsed;
}

/** Resolves the compiler's exact canonical allowlist while rejecting missing files and symbolic links. */
async function canonicalContentPaths(root) {
  const result = [];
  const rootReal = await realpath(root);
  for (const path of CONTENT_FILE_PATHS) {
    const absolute = resolve(root, path);
    const status = await lstat(absolute);
    const resolved = await realpath(absolute);
    if (!status.isFile() || status.isSymbolicLink() ||
        (resolved !== rootReal && !resolved.startsWith(`${rootReal}${sep}`))) {
      throw new Error("Canonical content allowlist contains a non-regular file.");
    }
    result.push(absolute);
  }
  return result;
}

/** Parses a fixed set of discovered canonical paths into one editor snapshot. */
async function loadFiles(root, absolutePaths) {
  const files = {};
  for (const absolutePath of absolutePaths) {
    const path = relative(root, absolutePath).split(sep).join("/");
    files[path] = JSON.parse(await readFile(absolutePath, "utf8"));
  }
  return files;
}

/** Converts compiler-specific diagnostic objects into the browser's stable diagnostic contract. */
function normalizeDiagnostics(result) {
  const source = Array.isArray(result) ? result : result?.diagnostics;
  if (!Array.isArray(source)) return [];
  return source.map((item) => ({
    severity: item.severity === "warning" || item.severity === "info" ? item.severity : "error",
    code: typeof item.code === "string" ? item.code : "CONTENT_VALIDATION",
    message: typeof item.message === "string" ? item.message : "Content validation failed.",
    ...(typeof item.file === "string" ? { path: item.file } :
      typeof item.path === "string" ? { path: item.path } : {}),
    ...(typeof item.pointer === "string" ? { pointer: item.pointer } :
      typeof item.file === "string" && typeof item.path === "string" ? { pointer: item.path } : {}),
  }));
}

/** Accepts compiler maps or records while enforcing the generated TypeScript allowlist. */
function normalizeGenerated(result) {
  const source = result instanceof Map ? Object.fromEntries(result) : result?.files ?? result;
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Content compiler returned an invalid generated file collection.");
  }
  const generated = {};
  let totalBytes = 0;
  for (const [path, text] of Object.entries(source)) {
    if (!GENERATED_PATH.test(path) || typeof text !== "string") {
      throw new Error("Content compiler attempted to produce a non-allowlisted generated file.");
    }
    totalBytes += Buffer.byteLength(text, "utf8");
    if (totalBytes > 8 * 1024 * 1024 || text.includes("\0")) {
      throw new Error("Generated content exceeds editor output safety limits.");
    }
    generated[path] = text.endsWith("\n") ? text : `${text}\n`;
  }
  return generated;
}

/** Verifies a transaction target resolves inside the project and is not itself a symbolic link. */
async function assertSafeTarget(rootReal, absolutePath) {
  const parentReal = await realpath(dirname(absolutePath));
  if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${sep}`)) {
    throw new Error("Editor transaction escaped the project root.");
  }
  try {
    if ((await lstat(absolutePath)).isSymbolicLink()) throw new Error("Editor refuses to replace a symbolic link.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/** Stages one exclusive same-directory temporary file so its final rename is atomic. */
async function writeReplacement(path, contents) {
  const temporary = `${path}.vf-${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return temporary;
}

/** Commits pre-staged replacements and restores every committed target if any rename fails. */
async function atomicTransaction(root, writes) {
  const rootReal = await realpath(root);
  const staged = [];
  const committed = [];
  try {
    for (const [path, contents] of Object.entries(writes)) {
      const absolute = resolve(root, path);
      await assertSafeTarget(rootReal, absolute);
      let previous = null;
      try { previous = await readFile(absolute, "utf8"); } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      staged.push({ path: absolute, temporary: await writeReplacement(absolute, contents), previous });
    }
    for (const entry of staged) {
      await rename(entry.temporary, entry.path);
      committed.push(entry);
    }
  } catch (error) {
    const rollbackErrors = [];
    // Restore committed targets in reverse order so the visible state returns toward its original snapshot.
    for (const entry of committed.reverse()) {
      try {
        if (entry.previous === null) await unlink(entry.path);
        else await rename(await writeReplacement(entry.path, entry.previous), entry.path);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    // Remove temporary files that were never renamed, while preserving cleanup errors for diagnosis.
    for (const entry of staged) {
      try { await unlink(entry.temporary); } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") rollbackErrors.push(cleanupError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Editor transaction and rollback both failed.");
    }
    throw error;
  }
}

/** Drops byte-identical generated outputs so a save touches only genuinely changed files. */
async function changedWrites(root, writes) {
  const changed = {};
  for (const [path, contents] of Object.entries(writes)) {
    try {
      if (await readFile(resolve(root, path), "utf8") === contents) continue;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    changed[path] = contents;
  }
  return changed;
}

/** Creates one revision-checked service instance for a single editor process. */
export async function createContentService(projectRoot) {
  const root = resolve(projectRoot);
  const canonicalPaths = await canonicalContentPaths(root);
  const allowlist = new Set(canonicalPaths.map((path) => relative(root, path).split(sep).join("/")));
  let files = await loadFiles(root, canonicalPaths);
  let hash = snapshotHash(files);
  let revision = 1;

  /** Enforces the startup allowlist before delegating semantic checks to the content compiler. */
  async function validate(snapshot) {
    assertSafeJson(snapshot);
    const paths = Object.keys(snapshot).sort();
    if (paths.length !== allowlist.size || paths.some((path) => !allowlist.has(path) || !CONTENT_PATH.test(path))) {
      throw new Error("The editor snapshot does not match the canonical content allowlist.");
    }
    return normalizeDiagnostics(await validateContentFiles(structuredClone(snapshot)));
  }

  return {
    /** Routes authenticated editor API calls and keeps all failures inside structured responses. */
    async handle(request, response, token) {
      if (!authorize(request, token)) return sendJson(response, 403, { error: "Editor bridge authorization failed." });
      const url = new URL(request.url ?? "/", "http://localhost");
      try {
        if (request.method === "GET" && url.pathname === "/__vf_editor/content") {
          const diagnostics = await validate(files);
          return sendJson(response, 200, { files, revision, hash, diagnostics });
        }
        if (request.method === "POST" && url.pathname === "/__vf_editor/validate") {
          const body = await readJsonBody(request);
          return sendJson(response, 200, { diagnostics: await validate(body.files) });
        }
        if (request.method === "POST" && url.pathname === "/__vf_editor/save") {
          const body = await readJsonBody(request);
          const diskFiles = await loadFiles(root, canonicalPaths);
          if (snapshotHash(diskFiles) !== hash) {
            return sendJson(response, 409, { error: "Content changed outside this editor; reload before saving." });
          }
          if (body.expectedRevision !== revision || body.expectedHash !== hash) {
            return sendJson(response, 409, { error: "Content changed outside this editor; reload before saving." });
          }
          const changesGeneration = Object.entries(body.files).some(([path, value]) => (
            path.startsWith("content/worldgen/") && JSON.stringify(files[path]) !== JSON.stringify(value)
          ));
          if (changesGeneration && body.generationDecision !== "migrate") {
            return sendJson(response, 409, {
              error: "World-generation changes require an explicit engine-v2 migration decision.",
            });
          }
          const diagnostics = await validate(body.files);
          if (diagnostics.some((item) => item.severity === "error")) {
            return sendJson(response, 422, { error: "Content contains validation errors.", diagnostics });
          }
          const generated = normalizeGenerated(await generateContentFiles(structuredClone(body.files)));
          const canonical = Object.fromEntries(Object.entries(body.files)
            .filter(([path, value]) => JSON.stringify(files[path]) !== JSON.stringify(value))
            .map(([path, value]) => [path, `${JSON.stringify(value, null, 2)}\n`]));
          const writes = await changedWrites(root, { ...canonical, ...generated });
          await atomicTransaction(root, writes);
          files = structuredClone(body.files);
          hash = snapshotHash(files);
          revision += 1;
          return sendJson(response, 200, {
            revision, hash, diagnostics, writtenFiles: Object.keys(writes).sort(),
          });
        }
        return sendJson(response, 404, { error: "Unknown editor bridge endpoint." });
      } catch (error) {
        console.error(`[VoxelFrontierEditor] ${new Date().toISOString()} ${request.method} ${url.pathname} failed.`,
          error);
        const rawMessage = error instanceof SyntaxError ? "Editor request contains invalid JSON." :
          error instanceof Error ? error.message : "Editor bridge operation failed.";
        const message = rawMessage.replaceAll(root, "<project>");
        return sendJson(response, 400, { error: message });
      }
    },
  };
}
