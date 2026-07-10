/**
 * Targets live entity collision boxes with a mathematical ray and applies player melee attacks.
 * Entity targeting precedes block breaking so one click cannot damage an actor and edit terrain simultaneously.
 */

import { Vector3 } from "three";
import type { EntityInstance } from "./entity-instance";

/** EntityHit identifies the nearest entity and exact ray distance. */
export interface EntityHit {
  readonly entity: EntityInstance;
  readonly distance: number;
}

/** Computes ray entry distance for one entity AABB using the slab method. */
function rayEntityDistance(origin: Vector3, direction: Vector3, entity: EntityInstance): number | null {
  const radius = entity.definition.dimensions.width / 2;
  const minimum = new Vector3(
    entity.position.x - radius,
    entity.position.y,
    entity.position.z - radius,
  );
  const maximum = new Vector3(
    entity.position.x + radius,
    entity.position.y + entity.definition.dimensions.height,
    entity.position.z + radius,
  );
  let near = 0;
  let far = Number.POSITIVE_INFINITY;

  // Each axis clips the shared interval; a disjoint interval means the ray misses the body.
  for (const axis of ["x", "y", "z"] as const) {
    if (Math.abs(direction[axis]) < 0.000001) {
      if (origin[axis] < minimum[axis] || origin[axis] > maximum[axis]) return null;
      continue;
    }
    const inverse = 1 / direction[axis];
    let first = (minimum[axis] - origin[axis]) * inverse;
    let second = (maximum[axis] - origin[axis]) * inverse;
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (near > far) return null;
  }
  return far < 0 ? null : near;
}

/** Finds the closest living entity intersected within the supplied reach. */
export function findEntityTarget(
  origin: Vector3,
  direction: Vector3,
  entities: Iterable<EntityInstance>,
  reach: number,
): EntityHit | null {
  let closest: EntityHit | null = null;
  for (const entity of entities) {
    if (!entity.active || !entity.isAlive()) {
      continue;
    }
    const distance = rayEntityDistance(origin, direction, entity);
    if (distance === null || distance > reach || (closest !== null && distance >= closest.distance)) {
      continue;
    }
    closest = { entity, distance };
  }
  return closest;
}
