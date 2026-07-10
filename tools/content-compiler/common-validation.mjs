/**
 * Provides strict reusable validation primitives with JSON-path diagnostics.
 * Validators accumulate independent defects so authors can repair a complete snapshot in one pass.
 */

// Canonical IDs use one lowercase namespace and resource path to remain portable across filesystems.
export const NAMESPACED_ID_PATTERN = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_./-]*$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** DiagnosticCollector records deterministic errors and warnings without throwing on authored input. */
export class DiagnosticCollector {
  constructor(initial = []) {
    this.diagnostics = [...initial];
  }

  /** Adds one machine-readable diagnostic at an exact canonical source location. */
  add(file, path, code, message, severity = "error") {
    this.diagnostics.push({ severity, code, file, path, message });
  }

  /** Returns true only when no error-severity diagnostic has accumulated. */
  get valid() {
    return !this.diagnostics.some((diagnostic) => diagnostic.severity === "error");
  }
}

/** Reports whether an unknown value is a non-array JSON object. */
export function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Requires a non-array object and returns it, or null after recording a type error. */
export function requireObject(value, collector, file, path) {
  if (isObject(value)) return value;
  collector.add(file, path, "expected-object", "Expected a JSON object.");
  return null;
}

/** Requires an array and returns it, or an empty array after recording a type error. */
export function requireArray(value, collector, file, path) {
  if (Array.isArray(value)) return value;
  collector.add(file, path, "expected-array", "Expected a JSON array.");
  return [];
}

/** Requires a non-empty string and optionally enforces a stable regular expression. */
export function requireString(value, collector, file, path, pattern) {
  if (typeof value === "string" && value.length > 0 && (pattern === undefined || pattern.test(value))) {
    return value;
  }
  collector.add(file, path, "invalid-string", "Expected a non-empty string in the required format.");
  return null;
}

/** Requires a finite number with inclusive optional bounds. */
export function requireNumber(value, collector, file, path, minimum = -Infinity, maximum = Infinity) {
  if (typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum) return value;
  collector.add(file, path, "invalid-number", `Expected a finite number from ${minimum} through ${maximum}.`);
  return null;
}

/** Requires an integer with inclusive optional bounds. */
export function requireInteger(value, collector, file, path, minimum = -Infinity, maximum = Infinity) {
  if (typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum) return value;
  collector.add(file, path, "invalid-integer", `Expected an integer from ${minimum} through ${maximum}.`);
  return null;
}

/** Requires a boolean value without truthy coercion. */
export function requireBoolean(value, collector, file, path) {
  if (typeof value === "boolean") return value;
  collector.add(file, path, "invalid-boolean", "Expected true or false.");
  return null;
}

/** Requires one exact string from an allowlist. */
export function requireChoice(value, choices, collector, file, path) {
  if (typeof value === "string" && choices.includes(value)) return value;
  collector.add(file, path, "invalid-choice", `Expected one of: ${choices.join(", ")}.`);
  return null;
}

/** Requires an inclusive two-number range whose lower endpoint does not exceed the upper endpoint. */
export function requireRange(value, collector, file, path, minimum = -Infinity, maximum = Infinity) {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number" &&
    typeof value[1] === "number" && Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
    value[0] >= minimum && value[1] <= maximum && value[0] <= value[1]) return value;
  collector.add(file, path, "invalid-range", "Expected an ordered inclusive two-number range.");
  return null;
}

/** Adds an ID to a category index and reports duplicates at the later declaration. */
export function requireUniqueId(id, index, collector, file, path, category) {
  if (id === null) return;
  if (index.has(id)) {
    collector.add(file, path, "duplicate-id", `Duplicate ${category} ID ${id}.`);
    return;
  }
  index.add(id);
}

/** Requires a previously indexed reference and reports a precise dangling-reference error. */
export function requireReference(value, index, collector, file, path, category) {
  const id = requireString(value, collector, file, path, NAMESPACED_ID_PATTERN);
  if (id !== null && !index.has(id)) collector.add(file, path, "missing-reference", `Unknown ${category} ID ${id}.`);
  return id;
}

/** Requires the schema version used by every canonical document in this release. */
export function validateSchema(document, collector, file) {
  const object = requireObject(document, collector, file, "$" );
  if (object !== null && object.schemaVersion !== 1) {
    collector.add(file, "$.schemaVersion", "unsupported-schema", "Only schemaVersion 1 is supported.");
  }
  return object;
}
