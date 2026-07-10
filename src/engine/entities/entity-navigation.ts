/**
 * Computes bounded A* paths across walkable voxel columns and converts them into entity movement intent.
 * Paths remain deterministic because neighbor order and tie-breaking are stable for identical world state.
 */

import { Vector3 } from "three";
import type { EntityInstance } from "./entity-instance";

/** EntityNavigationWorld is the voxel boundary required for walkability searches. */
export interface EntityNavigationWorld {
  isSolid(worldX: number, y: number, worldZ: number): boolean;
}

/** NavigationCell stores one candidate foot coordinate in the A* frontier. */
interface NavigationCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly key: string;
  readonly g: number;
  readonly f: number;
}

// Stable cardinal order makes equal-cost path choices reproducible.
const CARDINAL_DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Converts integer foot coordinates into a stable map key. */
function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Finds a standable foot height near the prior cell while respecting entity body height. */
function findStandY(
  world: EntityNavigationWorld,
  x: number,
  z: number,
  nearY: number,
  bodyWidth: number,
  bodyHeight: number,
): number | null {
  // Up-one then down-two supports ordinary steps and shallow drops without searching arbitrary cliffs.
  for (let y = nearY + 1; y >= nearY - 2; y -= 1) {
    if (!world.isSolid(x, y - 1, z)) {
      continue;
    }
    if (isEntityBodyClear(world, x + 0.5, y, z + 0.5, bodyWidth, bodyHeight)) {
      return y;
    }
  }
  return null;
}

/** Checks every voxel intersected by an entity AABB at a proposed foot position. */
export function isEntityBodyClear(
  world: EntityNavigationWorld,
  centerX: number,
  feetY: number,
  centerZ: number,
  bodyWidth: number,
  bodyHeight: number,
): boolean {
  const radius = bodyWidth / 2;
  const epsilon = 0.0001;
  const minX = Math.floor(centerX - radius + epsilon);
  const maxX = Math.floor(centerX + radius - epsilon);
  const minY = Math.floor(feetY + epsilon);
  const maxY = Math.floor(feetY + bodyHeight - epsilon);
  const minZ = Math.floor(centerZ - radius + epsilon);
  const maxZ = Math.floor(centerZ + radius - epsilon);
  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (world.isSolid(x, y, z)) return false;
      }
    }
  }
  return true;
}

/** Reconstructs world-centered waypoints from the goal back to the start. */
function reconstructPath(
  goalKey: string,
  cells: ReadonlyMap<string, NavigationCell>,
  parents: ReadonlyMap<string, string>,
): Vector3[] {
  const reversed: Vector3[] = [];
  let currentKey: string | undefined = goalKey;
  while (currentKey !== undefined) {
    const cell = cells.get(currentKey);
    if (cell === undefined) {
      break;
    }
    reversed.push(new Vector3(cell.x + 0.5, cell.y, cell.z + 0.5));
    currentKey = parents.get(currentKey);
  }
  reversed.reverse();
  return reversed.slice(1);
}

/** Finds a bounded walkable path and returns an empty path when the goal cannot be reached safely. */
export function findEntityPath(
  world: EntityNavigationWorld,
  start: Vector3,
  goal: Vector3,
  bodyWidth: number,
  bodyHeight: number,
  maximumVisited = 320,
): Vector3[] {
  const startX = Math.floor(start.x);
  const startZ = Math.floor(start.z);
  const goalX = Math.floor(goal.x);
  const goalZ = Math.floor(goal.z);
  const startY = findStandY(world, startX, startZ, Math.floor(start.y), bodyWidth, bodyHeight);
  if (startY === null) {
    return [];
  }
  const startKey = cellKey(startX, startY, startZ);
  const startCell: NavigationCell = {
    x: startX,
    y: startY,
    z: startZ,
    key: startKey,
    g: 0,
    f: Math.abs(goalX - startX) + Math.abs(goalZ - startZ),
  };
  const frontier: NavigationCell[] = [startCell];
  const cells = new Map<string, NavigationCell>([[startKey, startCell]]);
  const parents = new Map<string, string>();
  const costs = new Map<string, number>([[startKey, 0]]);
  const visited = new Set<string>();

  // The frontier is intentionally bounded so one unreachable target cannot consume an entire frame.
  while (frontier.length > 0 && visited.size < maximumVisited) {
    frontier.sort((left, right) => left.f - right.f || left.g - right.g || left.key.localeCompare(right.key));
    const current = frontier.shift();
    if (current === undefined || visited.has(current.key)) {
      continue;
    }
    visited.add(current.key);
    if (current.x === goalX && current.z === goalZ) {
      return reconstructPath(current.key, cells, parents);
    }

    CARDINAL_DIRECTIONS.forEach(([offsetX, offsetZ]) => {
      const nextX = current.x + offsetX;
      const nextZ = current.z + offsetZ;
      const nextY = findStandY(world, nextX, nextZ, current.y, bodyWidth, bodyHeight);
      if (nextY === null) {
        return;
      }
      const nextKey = cellKey(nextX, nextY, nextZ);
      const verticalCost = Math.abs(nextY - current.y) * 0.35;
      const nextCost = current.g + 1 + verticalCost;
      if (nextCost >= (costs.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        return;
      }
      const heuristic = Math.abs(goalX - nextX) + Math.abs(goalZ - nextZ);
      const next: NavigationCell = {
        x: nextX,
        y: nextY,
        z: nextZ,
        key: nextKey,
        g: nextCost,
        f: nextCost + heuristic,
      };
      costs.set(nextKey, nextCost);
      parents.set(nextKey, current.key);
      cells.set(nextKey, next);
      frontier.push(next);
    });
  }
  return [];
}

/** Follows the current waypoint and removes it once the entity reaches its center. */
export function followEntityPath(entity: EntityInstance): boolean {
  const waypoint = entity.navigationPath[0];
  if (waypoint === undefined) {
    return false;
  }
  const deltaX = waypoint.x - entity.position.x;
  const deltaZ = waypoint.z - entity.position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance < 0.18) {
    entity.navigationPath.shift();
    return followEntityPath(entity);
  }
  entity.intent.moveX = deltaX / distance;
  entity.intent.moveZ = deltaZ / distance;
  entity.intent.lookX = entity.intent.moveX;
  entity.intent.lookZ = entity.intent.moveZ;
  return true;
}
