/**
 * Implements an immutable namespaced registry used for compiled blocks, entities, and authoring data.
 * Construction rejects duplicate IDs so runtime lookups never depend on insertion order.
 */

import { ContentError } from "./content-errors";

/** IdentifiedContent is the minimum safe shape accepted by ContentRegistry. */
export interface IdentifiedContent {
  readonly id: string;
}

/** ContentRegistry indexes one validated data category without allowing runtime mutation. */
export class ContentRegistry<T extends IdentifiedContent> {
  private readonly records: ReadonlyMap<string, T>;

  /** Builds a complete immutable index from records and throws when an ID appears more than once. */
  public constructor(records: readonly T[]) {
    const index = new Map<string, T>();
    for (const record of records) {
      if (index.has(record.id)) {
        throw new ContentError("duplicate-content-id", `Duplicate compiled content ID: ${record.id}`, record.id);
      }
      index.set(record.id, record);
    }
    this.records = index;
  }

  /** Returns one record, or throws a typed error when validated content references an unavailable ID. */
  public require(id: string): T {
    const record = this.records.get(id);
    if (record === undefined) {
      throw new ContentError("missing-content-id", `Compiled content does not contain ${id}.`, id);
    }
    return record;
  }

  /** Returns one optional record for callers that explicitly support absent content. */
  public get(id: string): T | undefined {
    return this.records.get(id);
  }

  /** Reports whether a record exists without exposing the mutable backing map. */
  public has(id: string): boolean {
    return this.records.has(id);
  }

  /** Returns records in compiler-defined order for deterministic iteration and UI presentation. */
  public values(): readonly T[] {
    return [...this.records.values()];
  }
}
