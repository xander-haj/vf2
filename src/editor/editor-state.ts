/** Owns the editor's canonical in-memory snapshot, selection, diagnostics, and revision state. */

import type { EditorContentKind } from "./editor-content-kind";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue; }

export interface EditorDiagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly pointer?: string;
}

export interface EditorSelection {
  readonly file: string;
  readonly pointer: string;
  readonly label: string;
  readonly kind: EditorContentKind;
}

export interface LoadedContentSnapshot {
  readonly files: Readonly<Record<string, JsonValue>>;
  readonly revision: number;
  readonly hash: string;
  readonly diagnostics: readonly EditorDiagnostic[];
}

export interface EditorChange {
  readonly file: string;
  readonly pointer: string;
  readonly before: string;
  readonly after: string;
}

type StateListener = () => void;

/** Escapes one JSON Pointer segment according to RFC 6901. */
export function escapePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Resolves a JSON Pointer without evaluating path text as source code. */
export function resolvePointer(root: JsonValue, pointer: string): JsonValue | undefined {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined;
  let current: JsonValue | undefined = root;
  for (const encoded of pointer.slice(1).split("/")) {
    const segment = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (current !== null && typeof current === "object") {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Replaces a pointer value in a cloned document and returns the updated root. */
export function replacePointer(root: JsonValue, pointer: string, value: JsonValue): JsonValue {
  if (pointer === "") return structuredClone(value);
  const segments = pointer.slice(1).split("/").map((segment) => (
    segment.replaceAll("~1", "/").replaceAll("~0", "~")
  ));
  const clone = structuredClone(root);
  let parent: JsonValue = clone;
  for (const segment of segments.slice(0, -1)) {
    let next: JsonValue | undefined;
    if (Array.isArray(parent)) next = parent[Number(segment)];
    else if (parent !== null && typeof parent === "object") next = parent[segment];
    else throw new Error(`Cannot resolve editor path ${pointer}.`);
    if (next === undefined || next === null || typeof next !== "object") {
      throw new Error(`Cannot resolve editor path ${pointer}.`);
    }
    parent = next;
  }
  const finalSegment = segments.at(-1);
  if (finalSegment === undefined) return clone;
  if (Array.isArray(parent)) parent[Number(finalSegment)] = structuredClone(value);
  else if (parent !== null && typeof parent === "object") parent[finalSegment] = structuredClone(value);
  else throw new Error(`Cannot resolve editor path ${pointer}.`);
  return clone;
}

/** Coordinates editor data while leaving history mechanics to the command stack. */
export class EditorState {
  private files: Record<string, JsonValue> = {};
  private baseline: Record<string, string> = {};
  private baselineFiles: Record<string, JsonValue> = {};
  private listeners = new Set<StateListener>();
  selection: EditorSelection | null = null;
  diagnostics: readonly EditorDiagnostic[] = [];
  revision = 0;
  hash = "";
  validating = false;
  saving = false;
  previewSeed = 1;

  /** Registers a state observer and returns an unsubscribe callback for the same observer. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces all working state with a trusted bridge snapshot and establishes its baseline. */
  load(snapshot: LoadedContentSnapshot): void {
    this.files = structuredClone(snapshot.files);
    this.baselineFiles = structuredClone(snapshot.files);
    this.baseline = Object.fromEntries(
      Object.entries(this.files).map(([path, value]) => [path, JSON.stringify(value)]),
    );
    this.revision = snapshot.revision;
    this.hash = snapshot.hash;
    this.diagnostics = snapshot.diagnostics;
    this.selection = null;
    this.emit();
  }

  /** Returns a deep copy so network validation cannot mutate live editor objects. */
  snapshot(): Record<string, JsonValue> {
    return structuredClone(this.files);
  }

  /** Returns canonical files in deterministic path order for browsers and preview lookups. */
  fileEntries(): readonly [string, JsonValue][] {
    return Object.entries(this.files).sort(([left], [right]) => left.localeCompare(right));
  }

  /** Resolves the selected definition from its file and RFC 6901 pointer. */
  selectedValue(): JsonValue | undefined {
    if (this.selection === null) return undefined;
    const file = this.files[this.selection.file];
    return file === undefined ? undefined : resolvePointer(file, this.selection.pointer);
  }

  /** Updates selection without changing content or revision identity. */
  select(selection: EditorSelection | null): void {
    this.selection = selection;
    this.emit();
  }

  /** Applies one cloned pointer replacement and broadcasts the resulting working snapshot. */
  replace(file: string, pointer: string, value: JsonValue): void {
    const current = this.files[file];
    if (current === undefined) throw new Error(`Unknown content file: ${file}`);
    this.files[file] = replacePointer(current, pointer, value);
    this.emit();
  }

  /** Publishes diagnostics returned by full compiler validation. */
  setDiagnostics(diagnostics: readonly EditorDiagnostic[]): void {
    this.diagnostics = diagnostics;
    this.emit();
  }

  /** Tracks asynchronous validation and saving so conflicting toolbar actions stay disabled. */
  setActivity(activity: "validating" | "saving", active: boolean): void {
    if (activity === "validating") this.validating = active;
    else this.saving = active;
    this.emit();
  }

  /** Changes the non-persisted preview seed without affecting canonical dirty tracking. */
  setPreviewSeed(seed: number): void {
    if (!Number.isSafeInteger(seed) || seed === this.previewSeed) return;
    this.previewSeed = seed;
    this.emit();
  }

  /** Promotes a successful save to the new baseline and concurrency identity. */
  acceptSave(revision: number, hash: string, diagnostics: readonly EditorDiagnostic[]): void {
    this.revision = revision;
    this.hash = hash;
    this.diagnostics = diagnostics;
    this.baselineFiles = structuredClone(this.files);
    this.baseline = Object.fromEntries(
      Object.entries(this.files).map(([path, value]) => [path, JSON.stringify(value)]),
    );
    this.emit();
  }

  /** Lists content files whose semantic JSON differs from the loaded or saved baseline. */
  changedFiles(): readonly string[] {
    return Object.entries(this.files)
      .filter(([path, value]) => this.baseline[path] !== JSON.stringify(value))
      .map(([path]) => path)
      .sort();
  }

  /** Produces field-level before and after values for the editor's required change review. */
  changeDetails(): readonly EditorChange[] {
    const changes: EditorChange[] = [];
    const describe = (value: JsonValue | undefined): string => {
      if (value === undefined) return "missing";
      if (Array.isArray(value)) return `array (${value.length})`;
      if (value !== null && typeof value === "object") return "object";
      return JSON.stringify(value);
    };
    const compare = (
      file: string,
      before: JsonValue | undefined,
      after: JsonValue | undefined,
      pointer: string,
    ): void => {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      if (Array.isArray(before) && Array.isArray(after)) {
        const count = Math.max(before.length, after.length);
        for (let index = 0; index < count; index += 1) {
          compare(file, before[index], after[index], `${pointer}/${index}`);
        }
        return;
      }
      if (before !== null && after !== null && typeof before === "object" && typeof after === "object" &&
          !Array.isArray(before) && !Array.isArray(after)) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const key of [...keys].sort()) {
          compare(file, before[key], after[key], `${pointer}/${escapePointerSegment(key)}`);
        }
        return;
      }
      changes.push({ file, pointer, before: describe(before), after: describe(after) });
    };
    for (const path of this.changedFiles()) compare(path, this.baselineFiles[path], this.files[path], "");
    return changes;
  }

  get dirty(): boolean { return this.changedFiles().length > 0; }
  get hasErrors(): boolean { return this.diagnostics.some((item) => item.severity === "error"); }

  /** Notifies synchronous UI observers only after a complete state mutation. */
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
