/** Exposes detached entity state for the editor's isolated live blackboard inspector. */

import type { EntityInstance } from "./entity-instance";

/** EntityDebugSnapshot contains no mutable runtime collections or scene resources. */
export interface EntityDebugSnapshot {
  readonly id: string;
  readonly definitionId: string;
  readonly position: readonly [number, number, number];
  readonly health: number;
  readonly active: boolean;
  readonly target: EntityInstance["target"];
  readonly targetMemorySeconds: number;
  readonly attackCooldownSeconds: number;
  readonly navigationPath: readonly (readonly [number, number, number])[];
  readonly intent: Readonly<EntityInstance["intent"]>;
  readonly behaviorState: Readonly<Record<string, number | string | boolean>>;
}

/** Copies every live blackboard field needed to diagnose a production behavior graph. */
export function createEntityDebugSnapshots(
  entities: Iterable<EntityInstance>,
): readonly EntityDebugSnapshot[] {
  return [...entities].map((entity) => ({
    id: entity.id,
    definitionId: entity.definition.id,
    position: [entity.position.x, entity.position.y, entity.position.z],
    health: entity.health,
    active: entity.active,
    target: entity.target === null ? null : { ...entity.target },
    targetMemorySeconds: entity.targetMemorySeconds,
    attackCooldownSeconds: entity.attackCooldownSeconds,
    navigationPath: entity.navigationPath.map(
      (point): [number, number, number] => [point.x, point.y, point.z],
    ),
    intent: { ...entity.intent },
    behaviorState: Object.fromEntries(entity.behaviorState),
  }));
}
