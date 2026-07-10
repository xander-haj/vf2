/** Indexes validated animation controllers for simulation timing and renderer state selection. */

import type { EntityAnimationSetDefinition, EntityDefinition } from "./entity-model";

/** EntityAnimationLibrary keeps authored timing identical across combat feedback and presentation. */
export class EntityAnimationLibrary {
  private readonly definitions: ReadonlyMap<string, EntityAnimationSetDefinition>;

  public constructor(definitions: readonly EntityAnimationSetDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  /** Returns the complete controller assigned to one entity definition. */
  public get(entity: EntityDefinition): EntityAnimationSetDefinition | undefined {
    return this.definitions.get(entity.animationSetId);
  }

  /** Returns the authored attack presentation duration with a safe runtime minimum. */
  public getAttackDuration(entity: EntityDefinition): number {
    return Math.max(0.05, this.get(entity)?.attack.durationSeconds ?? 0.2);
  }

  /** Returns the authored hurt presentation duration with a safe runtime minimum. */
  public getHurtDuration(entity: EntityDefinition): number {
    return Math.max(0.05, this.get(entity)?.hurt.durationSeconds ?? 0.18);
  }
}
